import os
import time
import wave
from typing import Optional

import torch

import folder_paths
from .utils import lnl_fix_path
from .video_utils import lnl_get_audio

_CACHE = {}

def _normalize_audio_dict(audio):
    if audio is None:
        return None
    if isinstance(audio, dict) and "waveform" in audio:
        return audio
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

def _empty_audio_dict(sample_rate=44100):
    return {
        "waveform": torch.zeros((1, 1, 0), dtype=torch.float32),
        "sample_rate": sample_rate,
    }

def _cache_key(full_path: str) -> tuple:
    try:
        stat = os.stat(full_path)
        return (full_path, stat.st_mtime, stat.st_size)
    except OSError:
        return (full_path, None, None)

def _save_audio_preview(audio, cache_key) -> Optional[dict]:
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
    os.makedirs(target_dir, exist_ok=True)
    timestamp = int(time.time() * 1000)
    filename = f"lnl_audio_vid_{timestamp}.wav"
    file_path = os.path.join(target_dir, filename)
    with wave.open(file_path, "wb") as wav:
        wav.setnchannels(audio_np.shape[0])
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(interleaved.tobytes())
    preview = {
        "filename": filename,
        "subfolder": subfolder,
        "type": "temp",
    }
    _CACHE[cache_key] = preview
    return preview

def get_video_audio_preview(video_path: str) -> Optional[dict]:
    if not video_path:
        return None
    full_path = lnl_fix_path(video_path)
    if not os.path.exists(full_path):
        return None
    key = _cache_key(full_path)
    cached = _CACHE.get(key)
    if cached:
        return cached
    try:
        audio = lnl_get_audio(full_path, 0.0, 0.0)
    except Exception:
        audio = _empty_audio_dict()
    return _save_audio_preview(audio, key)
