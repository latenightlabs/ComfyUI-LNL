import os
import time
import wave
from collections.abc import Mapping

import torch
import numpy as np
from PIL import Image
import torch.nn.functional as F
from .video_utils import *
from .lnl_pause_messaging import send_and_wait, TimeoutResponse, send_progress
from .utils import lnl_fix_path

import folder_paths

"""
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):

"""

def _safe_int(value, default):
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default

def _safe_float(value, default):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default

def _normalize_force_size(force_size, allowed_values):
    if force_size is None:
        return "Disabled"
    value = str(force_size).strip()
    legacy_map = {
        "256": "256x256",
        "512": "512x512",
    }
    if value in legacy_map:
        return legacy_map[value]
    if value in allowed_values:
        return value
    return "Disabled"

def _normalize_images(images):
    if images is None:
        return None
    if isinstance(images, dict):
        images = images.get("image") or images.get("images")
    return images

def _get_images_length(images):
    if images is None:
        return 0
    try:
        return int(images.shape[0])
    except Exception:
        try:
            return len(images)
        except Exception:
            return 0

def _get_images_cache_key(images, force_size, custom_width, custom_height):
    if images is None:
        return None
    try:
        shape = tuple(images.shape)
        dtype = str(images.dtype)
        device = str(images.device) if hasattr(images, "device") else "cpu"
        data_ptr = None
        try:
            data_ptr = images.untyped_storage().data_ptr()
        except Exception:
            try:
                data_ptr = images.storage().data_ptr()
            except Exception:
                data_ptr = None
        return ("tensor", data_ptr, shape, dtype, device, force_size, custom_width, custom_height)
    except Exception:
        return ("object", id(images), force_size, custom_width, custom_height)

def _get_preview_cache_key(images_key, preview_size):
    return ("preview", images_key, preview_size)

def _get_audio_cache_key(audio, total_duration):
    audio_dict = _normalize_audio_dict(audio)
    if not audio_dict:
        return None
    waveform = audio_dict.get("waveform")
    sample_rate = int(audio_dict.get("sample_rate") or 44100)
    try:
        if not isinstance(waveform, torch.Tensor):
            waveform = torch.as_tensor(waveform)
        data_ptr = None
        try:
            data_ptr = waveform.untyped_storage().data_ptr()
        except Exception:
            try:
                data_ptr = waveform.storage().data_ptr()
            except Exception:
                data_ptr = None
        shape = tuple(waveform.shape)
        return ("audio", data_ptr, shape, sample_rate, float(total_duration))
    except Exception:
        return ("audio_obj", id(audio), sample_rate, float(total_duration))

def _get_video_audio_cache_key(video_path, total_duration):
    if not video_path:
        return None
    return ("video_audio", str(video_path), float(total_duration))

def _get_audio_envelope_cache_key(audio_key, bins):
    if audio_key is None:
        return None
    return ("audio_env", audio_key, int(bins))

def _sequence_frame_path(sequence, index):
    if not sequence:
        return None
    prefix = sequence.get("prefix")
    subfolder = sequence.get("subfolder", "")
    ext = sequence.get("ext", "png")
    pad = int(sequence.get("pad", 5))
    if not prefix:
        return None
    filename = f"{prefix}_{str(index).zfill(pad)}.{ext}"
    target_dir = os.path.join(folder_paths.get_temp_directory(), subfolder)
    return os.path.join(target_dir, filename)

def _save_audio_preview(audio, unique_id):
    audio_dict = _normalize_audio_dict(audio)
    if not audio_dict:
        return None
    sample_rate = int(audio_dict.get("sample_rate") or 44100)
    if sample_rate <= 0:
        sample_rate = 44100
    waveform = _ensure_waveform_tensor(audio_dict.get("waveform"))
    if waveform is None or waveform.numel() == 0:
        return None
    waveform = waveform.detach().cpu().float().squeeze(0)
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)
    waveform = torch.clamp(waveform, -1.0, 1.0)
    audio_np = (waveform * 32767.0).to(torch.int16).numpy()
    interleaved = audio_np.T.reshape(-1)

    temp_dir = folder_paths.get_temp_directory()
    subfolder = "lnl_frame_selector"
    target_dir = os.path.join(temp_dir, subfolder)
    _cleanup_temp_sequences(target_dir)
    os.makedirs(target_dir, exist_ok=True)
    timestamp = int(time.time() * 1000)
    filename = f"lnl_audio_{unique_id}_{timestamp}.wav"
    file_path = os.path.join(target_dir, filename)
    with wave.open(file_path, "wb") as wav:
        wav.setnchannels(audio_np.shape[0])
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(interleaved.tobytes())
    return {
        "filename": filename,
        "subfolder": subfolder,
        "type": "temp",
    }

def _compute_audio_envelope(audio, total_frames, bins=None):
    audio_dict = _normalize_audio_dict(audio)
    if not audio_dict:
        return None
    waveform = _ensure_waveform_tensor(audio_dict.get("waveform"))
    if waveform is None or waveform.numel() == 0:
        return None
    waveform = waveform.detach().cpu().float().squeeze(0)
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)
    mono = waveform.mean(0)
    total_samples = int(mono.numel())
    if total_samples <= 0:
        return None
    bins = int(bins or 0)
    if bins <= 0:
        bins = total_frames if total_frames and total_frames > 0 else 240
    bins = max(16, min(int(bins), total_samples, 240))
    step = max(1, total_samples // bins)
    trimmed = mono[: step * bins]
    if trimmed.numel() <= 0:
        return None
    shaped = trimmed.reshape(bins, step)
    rms = torch.sqrt(torch.mean(shaped ** 2, dim=1))
    max_val = float(rms.max().item()) if rms.numel() else 0.0
    return {"values": rms.tolist(), "max": max_val, "bins": int(bins)}

def _resize_image_batch(images, force_size, custom_width, custom_height):
    if images is None:
        return None
    if force_size == "Disabled":
        return images
    height = int(images.shape[1])
    width = int(images.shape[2])
    new_size = lnl_target_size(width, height, force_size, custom_width, custom_height)
    if new_size[0] == width and new_size[1] == height:
        return images
    s = images.movedim(-1, 1)
    s = lnl_common_upscale(s, new_size[0], new_size[1], "lanczos", "center")
    return s.movedim(1, -1)

def _resize_image_batch_for_preview(images, preview_size):
    if images is None or preview_size is None:
        return images
    try:
        height = int(images.shape[1])
        width = int(images.shape[2])
    except Exception:
        return images
    max_dim = max(width, height)
    if max_dim <= preview_size:
        return images
    scale = preview_size / float(max_dim)
    new_width = max(1, int(round(width * scale)))
    new_height = max(1, int(round(height * scale)))
    s = images.movedim(-1, 1)
    s = lnl_common_upscale(s, new_width, new_height, "lanczos", "center")
    return s.movedim(1, -1)

def _save_image_sequence(images, unique_id, progress_callback=None):
    images = _normalize_images(images)
    if images is None:
        return None
    temp_dir = folder_paths.get_temp_directory()
    subfolder = "lnl_frame_selector"
    target_dir = os.path.join(temp_dir, subfolder)
    _cleanup_temp_sequences(target_dir)
    os.makedirs(target_dir, exist_ok=True)
    timestamp = int(time.time() * 1000)
    prefix = f"lnl_seq_{unique_id}_{timestamp}"
    pad = 5
    images_np = images.detach().cpu().numpy()
    if images_np.dtype != np.uint8:
        max_val = images_np.max() if images_np.size else 1.0
        if max_val <= 1.0:
            images_np = np.clip(images_np, 0.0, 1.0) * 255.0
        else:
            images_np = np.clip(images_np, 0.0, 255.0)
        images_np = images_np.astype(np.uint8)
    total_count = int(images_np.shape[0]) if images_np.ndim >= 1 else 0
    step = max(1, total_count // 20) if total_count else 1
    for idx, frame in enumerate(images_np, start=1):
        filename = f"{prefix}_{str(idx).zfill(pad)}.png"
        file_path = os.path.join(target_dir, filename)
        try:
            Image.fromarray(frame).save(file_path)
        except Exception:
            Image.fromarray(frame[:, :, :3]).save(file_path)
        if progress_callback and (idx == 1 or idx % step == 0 or idx == total_count):
            progress_callback(idx, total_count)
    return {
        "prefix": prefix,
        "count": total_count,
        "subfolder": subfolder,
        "type": "temp",
        "ext": "png",
        "pad": pad,
    }

def _cleanup_temp_sequences(target_dir, max_age_seconds=7200):
    if not os.path.isdir(target_dir):
        return
    now = time.time()
    try:
        for filename in os.listdir(target_dir):
            if not filename.startswith("lnl_seq_") or not filename.endswith(".png"):
                continue
            full_path = os.path.join(target_dir, filename)
            try:
                if now - os.path.getmtime(full_path) > max_age_seconds:
                    os.remove(full_path)
            except OSError:
                continue
    except OSError:
        return

def _empty_audio_dict(sample_rate=44100):
    return {
        "waveform": torch.zeros((1, 1, 0), dtype=torch.float32),
        "sample_rate": sample_rate,
    }

def _safe_audio_output_dict(audio, fallback_sample_rate=44100):
    audio_dict = _normalize_audio_dict(audio)
    if not audio_dict:
        return {
            "waveform": torch.zeros((1, 1, 1), dtype=torch.float32),
            "sample_rate": int(fallback_sample_rate) if fallback_sample_rate and fallback_sample_rate > 0 else 44100,
        }
    sample_rate = int(audio_dict.get("sample_rate") or fallback_sample_rate or 44100)
    if sample_rate <= 0:
        sample_rate = 44100
    waveform = _ensure_waveform_tensor(audio_dict.get("waveform"))
    if waveform is None or waveform.numel() == 0:
        return {
            "waveform": torch.zeros((1, 1, 1), dtype=torch.float32),
            "sample_rate": sample_rate,
        }
    return {
        "waveform": waveform,
        "sample_rate": sample_rate,
    }

def _empty_audio_bytes():
    return b""

def _normalize_audio_dict(audio):
    if audio is None:
        return None
    if isinstance(audio, Mapping):
        try:
            if "waveform" in audio:
                _ = audio.get("waveform") if hasattr(audio, "get") else audio["waveform"]
                return audio
        except Exception:
            return None
    return None

def _ensure_waveform_tensor(waveform):
    if waveform is None:
        return None
    if not isinstance(waveform, torch.Tensor):
        waveform = torch.as_tensor(waveform)
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0).unsqueeze(0)
    elif waveform.dim() == 2:
        waveform = waveform.unsqueeze(0)
    return waveform

def _pad_or_crop_waveform(waveform, target_samples):
    if waveform is None:
        return None
    current_samples = waveform.shape[-1]
    if target_samples < 0:
        target_samples = 0
    if current_samples == target_samples:
        return waveform
    if current_samples > target_samples:
        return waveform[..., :target_samples]
    pad_amount = target_samples - current_samples
    if pad_amount <= 0:
        return waveform
    pad = (0, pad_amount)
    return F.pad(waveform, pad)

def _align_audio_to_video(audio, total_duration, trim_start, trim_duration):
    audio_dict = _normalize_audio_dict(audio)
    if not audio_dict:
        return _empty_audio_dict()
    sample_rate = int(audio_dict.get("sample_rate") or 44100)
    if sample_rate <= 0:
        sample_rate = 44100
    waveform = _ensure_waveform_tensor(audio_dict.get("waveform"))
    if waveform is None:
        return _empty_audio_dict(sample_rate)
    if waveform.numel() == 0:
        return _empty_audio_dict(sample_rate)

    total_target = max(0.0, total_duration, trim_start + trim_duration)
    total_samples = int(round(total_target * sample_rate))
    waveform = _pad_or_crop_waveform(waveform, total_samples)

    start_samples = int(round(max(0.0, trim_start) * sample_rate))
    trim_samples = int(round(max(0.0, trim_duration) * sample_rate))
    end_samples = start_samples + trim_samples
    if end_samples > total_samples:
        waveform = _pad_or_crop_waveform(waveform, end_samples)
    if trim_samples <= 0:
        trimmed = waveform[..., 0:0]
    else:
        trimmed = waveform[..., start_samples:end_samples]
    return {"waveform": trimmed, "sample_rate": sample_rate}
def getImageBatch(full_video_path, number_of_frames_to_process, select_every_nth_frame, starting_frame, force_size, custom_width, custom_height):
    generatedImages = lnl_cv_frame_generator(full_video_path, number_of_frames_to_process, starting_frame, select_every_nth_frame)
    (width, height, target_frame_time) = next(generatedImages)
    width = int(width)
    height = int(height)

    imageBatch = torch.from_numpy(np.fromiter(generatedImages, np.dtype((np.float32, (height, width, 3)))))
    if len(imageBatch) == 0:
        raise RuntimeError("No frames generated")

    if force_size != "Disabled":
        new_size = lnl_target_size(width, height, force_size, custom_width, custom_height)
        if new_size[0] != width or new_size[1] != height:
            s = imageBatch.movedim(-1,1)
            s = lnl_common_upscale(s, new_size[0], new_size[1], "lanczos", "center")
            imageBatch = s.movedim(1,-1)

    return (imageBatch, target_frame_time)

class FrameSelectorV3():

    supported_video_extensions =  ['webm', 'mp4', 'mkv']
    force_size_options = [
        "Disabled",
        "Custom Height",
        "Custom Width",
        "Custom",
        "256x?",
        "?x256",
        "256x256",
        "512x?",
        "?x512",
        "512x512",
    ]
    legacy_force_size_options = ["256", "512"]

    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = []
        for root, _, filenames in os.walk(input_dir):
            for filename in filenames:
                file_parts = filename.rsplit(".", 1)
                if len(file_parts) <= 1:
                    continue
                if file_parts[-1].lower() not in FrameSelectorV3.supported_video_extensions:
                    continue
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, input_dir).replace("\\", "/")
                files.append(rel_path)
        files = sorted(set(files))
        default_video_path = files[0] if files else ""
        return {
            "required": {
                "video_path": ("STRING", {"default": default_video_path}),
                "force_size": (FrameSelectorV3.force_size_options + FrameSelectorV3.legacy_force_size_options,),
                "custom_width": ("INT", {"default": 512, "min": 0, "max": 8192, "step": 8}),
                "custom_height": ("INT", {"default": 512, "min": 0, "max": 8192, "step": 8}),
                "pause_on_execute": ("BOOLEAN", {"default": False}),
                "pause_timeout": ("INT", {"default": 1000, "min": 1, "max": 9999999}),
            },
            "optional": {
                "images": ("IMAGE",),
                "audio": ("AUDIO",),
                "fps": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 240.0, "step": 0.1, "forceInput": True}),
                "graph_id": ("STRING", {"default": ""}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID"
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "STRING", "INT", "INT", "INT", "INT", "INT", "VHS_AUDIO",)
    RETURN_NAMES = ("Current image", "Image Batch (in/out)", "Frame in", "Frame out", "Filename", "Frame count (rel)", "Frame count (abs)", "Current frame (rel)", "Current frame (abs)", "Frame rate", "audio",)
    OUTPUT_NODE = False
    CATEGORY = "LNL"
    FUNCTION = "process_video"

    def process_video(
        self,
        video_path,
        force_size,
        custom_width,
        custom_height,
        pause_on_execute=False,
        pause_timeout=600,
        images=None,
        audio=None,
        fps=None,
        graph_id=None,
        prompt=None,
        unique_id=None
    ):
        if custom_width is None:
            custom_width = 512
        if custom_height is None:
            custom_height = 512
        force_size = _normalize_force_size(force_size, FrameSelectorV3.force_size_options)
        prompt_inputs = {}
        if isinstance(prompt, dict):
            node_data = prompt.get(str(unique_id)) or prompt.get(unique_id) or {}
            if isinstance(node_data, dict):
                prompt_inputs = node_data.get("inputs") or {}
        if not isinstance(prompt_inputs, dict):
            prompt_inputs = {}
        images = _normalize_images(images)
        using_image_batch = images is not None
        images_cache_key = _get_images_cache_key(images, force_size, custom_width, custom_height) if using_image_batch else None

        slider_data = prompt_inputs.get("in_out_point_slider") or {}
        total_frames = _safe_int(slider_data.get("totalFrames"), 0)
        frame_rate = _safe_float(slider_data.get("frameRate"), 0.0)

        graph_id_value = graph_id if graph_id is not None else prompt_inputs.get("graph_id", "")
        if pause_on_execute:
            send_progress(unique_id, graph_id_value, "Reading media info...")

        full_video_path = None
        if using_image_batch:
            total_from_images = _get_images_length(images)
            total_frames = _safe_int(total_from_images, 1)
            if _safe_float(fps, 0.0) > 0.0:
                frame_rate = float(fps)
            elif frame_rate <= 0.0:
                frame_rate = 30.0
        else:
            if not isinstance(video_path, str) or not video_path.strip():
                raise ValueError("video_path is required when images input is not connected")
            full_video_path = lnl_fix_path(video_path)
            info_frame_rate, info_total_frames, _ = get_video_info(full_video_path)
            total_frames = _safe_int(info_total_frames, 1)
            frame_rate = _safe_float(info_frame_rate, 1.0)

        in_point = _safe_int(prompt_inputs.get("in_point"), _safe_int(slider_data.get("startMarkerFrame"), 1))
        out_point = _safe_int(prompt_inputs.get("out_point"), _safe_int(slider_data.get("endMarkerFrame"), total_frames))
        current_frame = _safe_int(prompt_inputs.get("current_frame"), _safe_int(slider_data.get("currentFrame"), in_point))

        pause_completed = False
        if pause_on_execute:
            payload = {
                "current_frame": current_frame,
                "in_point": in_point,
                "out_point": out_point,
                "total_frames": total_frames,
                "frame_rate": frame_rate,
            }
            total_duration = (total_frames / frame_rate) if frame_rate else 0.0
            envelope_audio = None
            audio_cache_key = None
            if audio is not None:
                aligned_audio = _align_audio_to_video(audio, total_duration, 0.0, total_duration)
                envelope_audio = aligned_audio
                audio_cache_key = _get_audio_cache_key(aligned_audio, total_duration)
                cached_audio = getattr(self, "_lnl_cached_audio_preview", None)
                audio_preview = None
                if cached_audio and cached_audio.get("key") == audio_cache_key:
                    audio_preview = cached_audio.get("preview")
                if audio_preview is None:
                    audio_preview = _save_audio_preview(aligned_audio, unique_id)
                    if audio_preview:
                        self._lnl_cached_audio_preview = {
                            "key": audio_cache_key,
                            "preview": audio_preview,
                        }
                if audio_preview:
                    payload["audio_preview"] = audio_preview
            elif not using_image_batch and full_video_path:
                video_audio_key = _get_video_audio_cache_key(full_video_path, total_duration)
                video_audio = None
                cached_audio = getattr(self, "_lnl_cached_audio_preview", None)
                audio_preview = None
                if cached_audio and cached_audio.get("key") == video_audio_key:
                    audio_preview = cached_audio.get("preview")
                if audio_preview is None:
                    try:
                        video_audio = lnl_lazy_get_audio(full_video_path, 0.0, total_duration)
                    except Exception:
                        video_audio = _empty_audio_dict()
                    envelope_audio = video_audio
                    audio_preview = _save_audio_preview(video_audio, unique_id)
                    if audio_preview:
                        self._lnl_cached_audio_preview = {
                            "key": video_audio_key,
                            "preview": audio_preview,
                        }
                if audio_preview:
                    payload["audio_preview"] = audio_preview
                audio_cache_key = video_audio_key

            if envelope_audio is not None:
                bins = min(240, total_frames) if total_frames else 240
                envelope_cache_key = _get_audio_envelope_cache_key(audio_cache_key, bins)
                cached_env = getattr(self, "_lnl_cached_audio_envelope", None)
                envelope = None
                if cached_env and cached_env.get("key") == envelope_cache_key:
                    envelope = cached_env.get("envelope")
                if envelope is None:
                    envelope = _compute_audio_envelope(envelope_audio, total_frames, bins=bins)
                    if envelope:
                        self._lnl_cached_audio_envelope = {
                            "key": envelope_cache_key,
                            "envelope": envelope,
                        }
                if envelope:
                    payload["audio_envelope"] = envelope
            elif audio_cache_key is not None and not using_image_batch and full_video_path:
                bins = min(240, total_frames) if total_frames else 240
                envelope_cache_key = _get_audio_envelope_cache_key(audio_cache_key, bins)
                cached_env = getattr(self, "_lnl_cached_audio_envelope", None)
                if not (cached_env and cached_env.get("key") == envelope_cache_key):
                    try:
                        envelope_audio = lnl_lazy_get_audio(full_video_path, 0.0, total_duration)
                    except Exception:
                        envelope_audio = _empty_audio_dict()
                    envelope = _compute_audio_envelope(envelope_audio, total_frames, bins=bins)
                    if envelope:
                        self._lnl_cached_audio_envelope = {
                            "key": envelope_cache_key,
                            "envelope": envelope,
                        }
                        payload["audio_envelope"] = envelope
            if using_image_batch:
                preview_cache_key = (images_cache_key, frame_rate, total_frames)
                preview_sequence = None
                cached_preview = getattr(self, "_lnl_cached_preview", None)
                if cached_preview and cached_preview.get("key") == preview_cache_key:
                    candidate = cached_preview.get("sequence")
                    if candidate and _sequence_frame_path(candidate, 1) and os.path.exists(_sequence_frame_path(candidate, 1)):
                        preview_sequence = candidate
                if preview_sequence is None:
                    send_progress(unique_id, graph_id_value, "Preparing image preview...", 0, total_frames)
                    preview_source = images
                    preview_size = 512
                    preview_key = _get_preview_cache_key(images_cache_key, preview_size)
                    cached_preview_images = getattr(self, "_lnl_cached_preview_images", None)
                    if cached_preview_images and cached_preview_images.get("key") == preview_key:
                        preview_source = cached_preview_images.get("images") or preview_source
                    else:
                        preview_source = _resize_image_batch_for_preview(images, preview_size)
                        self._lnl_cached_preview_images = {"key": preview_key, "images": preview_source}
                    preview_sequence = _save_image_sequence(
                        preview_source,
                        unique_id,
                        progress_callback=lambda current, total: send_progress(
                            unique_id,
                            graph_id_value,
                            f"Preparing image preview... ({current}/{total})",
                            current,
                            total,
                        ),
                    )
                    if preview_sequence:
                        self._lnl_cached_preview = {"key": preview_cache_key, "sequence": preview_sequence}
                if preview_sequence:
                    preview_sequence["frame_rate"] = frame_rate
                    payload["preview_sequence"] = preview_sequence
                    payload["preview_mode"] = "image_sequence"
            response = send_and_wait(payload, pause_timeout, unique_id, graph_id_value)
            if not isinstance(response, TimeoutResponse):
                pause_completed = True
                in_point = _safe_int(response.in_point, in_point)
                out_point = _safe_int(response.out_point, out_point)
                current_frame = _safe_int(response.current_frame, current_frame)

        in_point = max(1, min(in_point, total_frames))
        out_point = max(in_point, min(out_point, total_frames))
        current_frame = max(1, min(current_frame, total_frames))

        select_every_nth_frame = _safe_int(prompt_inputs.get("select_every_nth_frame"), 1)
        if select_every_nth_frame <= 0:
            select_every_nth_frame = 1

        frames_to_process = out_point - in_point + 1
        starting_frame = in_point

        if using_image_batch:
            output_cache_key = (
                images_cache_key,
                current_frame,
                in_point,
                out_point,
                select_every_nth_frame,
            )
            cached_output = getattr(self, "_lnl_cached_output", None)
            if cached_output and cached_output.get("key") == output_cache_key:
                current_image = cached_output.get("current_image")
                in_out_images = cached_output.get("in_out_images")
                if current_image is not None and in_out_images is not None:
                    self.target_frame_time = 1.0 / frame_rate if frame_rate else 0.0
                    audio_value = audio if audio is not None else _empty_audio_bytes()
                    filename_value = ""
                    return (
                        current_image,
                        in_out_images,
                        in_point,
                        out_point,
                        filename_value,
                        frames_to_process,
                        total_frames,
                        current_frame - in_point + 1,
                        current_frame,
                        frame_rate,
                        audio_value,
                    )
            if pause_on_execute and not pause_completed:
                send_progress(unique_id, graph_id_value, "Preparing frames...")
            cached_images = getattr(self, "_lnl_cached_images", None)
            if cached_images and cached_images.get("key") == images_cache_key:
                resized_images = cached_images.get("images")
            else:
                resized_images = _resize_image_batch(images, force_size, custom_width, custom_height)
                self._lnl_cached_images = {"key": images_cache_key, "images": resized_images}
            current_index = max(0, current_frame - 1)
            current_image = resized_images[current_index:current_index + 1]
            in_index = max(0, in_point - 1)
            out_index = max(in_index + 1, out_point)
            in_out_images = resized_images[in_index:out_index:select_every_nth_frame]
            self.target_frame_time = 1.0 / frame_rate if frame_rate else 0.0
            audio_value = audio if audio is not None else _empty_audio_bytes()
            filename_value = ""
            self._lnl_cached_output = {
                "key": output_cache_key,
                "current_image": current_image,
                "in_out_images": in_out_images,
            }
        else:
            if pause_on_execute and not pause_completed:
                send_progress(unique_id, graph_id_value, "Extracting frames...")
            (current_image, _) = getImageBatch(full_video_path, 1, 1, current_frame - 1, force_size, custom_width, custom_height)
            (in_out_images, target_frame_time) = getImageBatch(full_video_path, frames_to_process, select_every_nth_frame, starting_frame - 1, force_size, custom_width, custom_height)
            self.target_frame_time = target_frame_time

            if audio is not None:
                if pause_on_execute and not pause_completed:
                    send_progress(unique_id, graph_id_value, "Aligning audio...")
                audio_value = audio
            else:
                if pause_on_execute and not pause_completed:
                    send_progress(unique_id, graph_id_value, "Extracting audio...")
                audio_value = lnl_lazy_eval(lambda: lnl_get_audio(full_video_path, max(0.0, (starting_frame - 1) * target_frame_time),
                                       frames_to_process*target_frame_time*select_every_nth_frame))
            filename_value = video_path

        self._lnl_pause_completed = pause_completed
        return (
            current_image,
            in_out_images,
            in_point,
            out_point,
            filename_value,
            frames_to_process,
            total_frames,
            current_frame - in_point + 1,
            current_frame,
            frame_rate,
            audio_value,
        )

class FrameSelectorV4(FrameSelectorV3):

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "STRING", "INT", "INT", "INT", "INT", "INT", "FLOAT", "AUDIO",)
    RETURN_NAMES = ("Current image", "Image Batch (in/out)", "Frame in", "Frame out", "Filename", "Frame count (rel)", "Frame count (abs)", "Current frame (rel)", "Current frame (abs)", "Frame rate (INT)", "Frame rate (FLOAT)", "audio",)
    OUTPUT_NODE = False
    CATEGORY = "LNL"
    FUNCTION = "process_video"

    def process_video(
        self,
        video_path,
        force_size,
        custom_width,
        custom_height,
        pause_on_execute=False,
        pause_timeout=600,
        images=None,
        audio=None,
        fps=None,
        graph_id=None,
        prompt=None,
        unique_id=None
    ):
        result = super().process_video(
            video_path,
            force_size,
            custom_width,
            custom_height,
            pause_on_execute,
            pause_timeout,
            images,
            audio,
            fps,
            graph_id,
            prompt,
            unique_id,
        )
        in_point = result[2]
        frames_to_process = result[5]
        total_frames = result[6]
        frame_rate = result[9]

        prompt_inputs = {}
        if isinstance(prompt, dict):
            node_data = prompt.get(str(unique_id)) or prompt.get(unique_id) or {}
            if isinstance(node_data, dict):
                prompt_inputs = node_data.get("inputs") or {}
        if not isinstance(prompt_inputs, dict):
            prompt_inputs = {}
        select_every_nth_frame = _safe_int(prompt_inputs.get("select_every_nth_frame"), 1)
        if select_every_nth_frame <= 0:
            select_every_nth_frame = 1
        graph_id_value = graph_id if graph_id is not None else prompt_inputs.get("graph_id", "")
        pause_completed = bool(getattr(self, "_lnl_pause_completed", False))

        using_image_batch = _normalize_images(images) is not None
        trim_start = max(0.0, (in_point - 1) * self.target_frame_time)
        trim_duration = frames_to_process * self.target_frame_time * select_every_nth_frame
        total_duration = total_frames * self.target_frame_time
        if audio is not None:
            if pause_on_execute and not pause_completed:
                send_progress(unique_id, graph_id_value, "Aligning audio...")
            audio_value = _align_audio_to_video(audio, total_duration, trim_start, trim_duration)
        elif using_image_batch:
            audio_value = _safe_audio_output_dict(_empty_audio_dict())
        else:
            full_video_path = lnl_fix_path(video_path)
            audio_value = lnl_lazy_get_audio(
                full_video_path,
                trim_start,
                trim_duration
            )
        audio_value = _safe_audio_output_dict(audio_value)

        safe_frame_rate = _safe_float(frame_rate, 0.0)
        if safe_frame_rate <= 0.0:
            safe_frame_rate = 30.0 if total_frames else 0.0

        return result[:9] + (int(safe_frame_rate), safe_frame_rate, audio_value,)

NODE_CLASS_MAPPINGS = {
    "LNL_FrameSelectorV4": FrameSelectorV4,
    "LNL_FrameSelectorV3": FrameSelectorV3
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "LNL_FrameSelectorV4": "LNL Frame Selector V3",
    "LNL_FrameSelectorV3": "LNL Frame Selector [Deprecated] ⛔️"
}
