import os

import torch
import numpy as np
from .video_utils import *
from .lnl_pause_messaging import send_and_wait, TimeoutResponse
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

    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = []
        for f in os.listdir(input_dir):
            if os.path.isfile(os.path.join(input_dir, f)):
                file_parts = f.split('.')
                if len(file_parts) > 1 and (file_parts[-1] in FrameSelectorV3.supported_video_extensions):
                    files.append(f)
        return {
            "required": {
                "video_path": (sorted(files),),
                "force_size": (["Disabled", "Custom Height", "Custom Width", "Custom", "256x?", "?x256", "256x256", "512x?", "?x512", "512x512"],),
                "custom_width": ("INT", {"default": 512, "min": 0, "max": 8192, "step": 8}),
                "custom_height": ("INT", {"default": 512, "min": 0, "max": 8192, "step": 8}),
                "pause_on_execute": ("BOOLEAN", {"default": False}),
                "pause_timeout": ("INT", {"default": 1000, "min": 1, "max": 9999999}),
            },
            "optional": {
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
        graph_id=None,
        prompt=None,
        unique_id=None
    ):
        if custom_width is None:
            custom_width = 512
        if custom_height is None:
            custom_height = 512
        prompt_inputs = {}
        if isinstance(prompt, dict):
            node_data = prompt.get(str(unique_id)) or prompt.get(unique_id) or {}
            if isinstance(node_data, dict):
                prompt_inputs = node_data.get("inputs") or {}
        if not isinstance(prompt_inputs, dict):
            prompt_inputs = {}
        full_video_path = lnl_fix_path(video_path)

        slider_data = prompt_inputs.get("in_out_point_slider") or {}
        total_frames = _safe_int(slider_data.get("totalFrames"), 0)
        frame_rate = _safe_float(slider_data.get("frameRate"), 0.0)

        if total_frames <= 0 or frame_rate <= 0.0:
            info_frame_rate, info_total_frames, _ = get_video_info(full_video_path)
            if total_frames <= 0:
                total_frames = _safe_int(info_total_frames, 1)
            if frame_rate <= 0.0:
                frame_rate = _safe_float(info_frame_rate, 1.0)

        in_point = _safe_int(prompt_inputs.get("in_point"), _safe_int(slider_data.get("startMarkerFrame"), 1))
        out_point = _safe_int(prompt_inputs.get("out_point"), _safe_int(slider_data.get("endMarkerFrame"), total_frames))
        current_frame = _safe_int(prompt_inputs.get("current_frame"), _safe_int(slider_data.get("currentFrame"), in_point))

        if pause_on_execute:
            graph_id_value = graph_id if graph_id is not None else prompt_inputs.get("graph_id", "")
            payload = {
                "current_frame": current_frame,
                "in_point": in_point,
                "out_point": out_point,
                "total_frames": total_frames,
                "frame_rate": frame_rate,
            }
            response = send_and_wait(payload, pause_timeout, unique_id, graph_id_value)
            if not isinstance(response, TimeoutResponse):
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

        (current_image, _) = getImageBatch(full_video_path, 1, 1, current_frame - 1, force_size, custom_width, custom_height)
        (in_out_images, target_frame_time) = getImageBatch(full_video_path, frames_to_process, select_every_nth_frame, starting_frame - 1, force_size, custom_width, custom_height)
        self.target_frame_time = target_frame_time

        audio = lambda: lnl_get_audio(full_video_path, starting_frame * target_frame_time,
                               frames_to_process*target_frame_time*select_every_nth_frame)

        return (
            current_image,
            in_out_images,
            in_point,
            out_point,
            video_path,
            frames_to_process,
            total_frames,
            current_frame - in_point + 1,
            current_frame,
            frame_rate,
            lnl_lazy_eval(audio),
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
        graph_id=None,
        prompt=None,
        unique_id=None
    ):
        full_video_path = lnl_fix_path(video_path)

        result = super().process_video(
            video_path,
            force_size,
            custom_width,
            custom_height,
            pause_on_execute,
            pause_timeout,
            graph_id,
            prompt,
            unique_id,
        )
        in_point = result[2]
        frames_to_process = result[5]

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

        audio = lnl_lazy_get_audio(
            full_video_path,
            in_point * self.target_frame_time,
            frames_to_process * self.target_frame_time * select_every_nth_frame
        )

        return result[:9] + (int(result[9]), result[9], audio,)

NODE_CLASS_MAPPINGS = {
    "LNL_FrameSelectorV4": FrameSelectorV4,
    "LNL_FrameSelectorV3": FrameSelectorV3
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "LNL_FrameSelectorV4": "LNL Frame Selector V2",
    "LNL_FrameSelectorV3": "LNL Frame Selector [Deprecated] ⛔️"
}
