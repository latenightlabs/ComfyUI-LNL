import os

import torch
import numpy as np
from .video_utils import *

import folder_paths

"""
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):

"""
def getImageBatch(full_video_path, frames_to_process, select_every_nth_frame, starting_frame, force_size, custom_width, custom_height):
    generatedImages = lnl_cv_frame_generator(full_video_path, frames_to_process, starting_frame, select_every_nth_frame)
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

class FrameSelector:

    supported_video_extensions =  ['webm', 'mp4', 'mkv']

    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = []
        for f in os.listdir(input_dir):
            if os.path.isfile(os.path.join(input_dir, f)):
                file_parts = f.split('.')
                if len(file_parts) > 1 and (file_parts[-1] in FrameSelector.supported_video_extensions):
                    files.append(f"input/{f}")
        return {
            "required": {
                "video_path": (sorted(files),),
            },
            "hidden": {
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID"
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "INT", "INT", "INT", "VHS_AUDIO",)
    RETURN_NAMES = ("Current image", "Image Batch (in/out)", "Frame count (rel)", "Frame count (abs)", "Current frame (rel)", "Current frame (abs)", "Frame rate", "audio",)
    OUTPUT_NODE = True
    CATEGORY = "LNL"
    FUNCTION = "process_video"

    def process_video(
        self,
        video_path,
        prompt=None,
        unique_id=None
    ):
        prompt_inputs = prompt[unique_id]["inputs"]
        full_video_path = os.path.join(folder_paths.base_path, video_path)

        in_point = prompt_inputs["in_out_point_slider"]["startMarkerFrame"]
        out_point = prompt_inputs["in_out_point_slider"]["endMarkerFrame"]
        current_frame = prompt_inputs["in_out_point_slider"]["currentFrame"]
        total_frames = prompt_inputs["in_out_point_slider"]["totalFrames"]
        frame_rate = prompt_inputs["in_out_point_slider"]["frameRate"]

        select_every_nth_frame = prompt_inputs["select_every_nth_frame"]

        frames_to_process = out_point - in_point + 1
        starting_frame = in_point

        (current_image, _) = getImageBatch(full_video_path, 1, 1, current_frame, "Disabled", 0, 0)
        (in_out_images, target_frame_time) = getImageBatch(full_video_path, frames_to_process, select_every_nth_frame, starting_frame, "Disabled", 0, 0)

        audio = lambda: lnl_get_audio(full_video_path, starting_frame * target_frame_time,
                               frames_to_process*target_frame_time*select_every_nth_frame)

        return (
            current_image,
            in_out_images,
            frames_to_process,
            total_frames,
            current_frame - in_point + 1,
            current_frame,
            frame_rate,
            lnl_lazy_eval(audio),
        )

class FrameSelectorV2(FrameSelector):

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "STRING", "INT", "INT", "INT", "INT", "INT", "VHS_AUDIO",)
    RETURN_NAMES = ("Current image", "Image Batch (in/out)", "Frame in", "Frame out", "Filename", "Frame count (rel)", "Frame count (abs)", "Current frame (rel)", "Current frame (abs)", "Frame rate", "audio",)
    OUTPUT_NODE = True
    CATEGORY = "LNL"
    FUNCTION = "process_video"

    def process_video(
        self,
        video_path,
        prompt=None,
        unique_id=None
    ):
        prompt_inputs = prompt[unique_id]["inputs"]
        in_point = prompt_inputs["in_out_point_slider"]["startMarkerFrame"]
        out_point = prompt_inputs["in_out_point_slider"]["endMarkerFrame"]

        result = super().process_video(video_path, prompt, unique_id)
        return result[:2] + (in_point, out_point, video_path,) + result[2:]

class FrameSelectorV3(FrameSelectorV2):

    @classmethod
    def INPUT_TYPES(s):
        v2_input_types = FrameSelectorV2.INPUT_TYPES()
        v2_input_types["required"]["force_size"] = (["Disabled", "Custom Height", "Custom Width", "Custom", "256x?", "?x256", "256x256", "512x?", "?x512", "512x512"],)
        v2_input_types["required"]["custom_width"] = ("INT", {"default": 512, "min": 0, "max": 8192, "step": 8})
        v2_input_types["required"]["custom_height"] = ("INT", {"default": 512, "min": 0, "max": 8192, "step": 8})
        return v2_input_types

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "STRING", "INT", "INT", "INT", "INT", "INT", "VHS_AUDIO",)
    RETURN_NAMES = ("Current image", "Image Batch (in/out)", "Frame in", "Frame out", "Filename", "Frame count (rel)", "Frame count (abs)", "Current frame (rel)", "Current frame (abs)", "Frame rate", "audio",)
    OUTPUT_NODE = True
    CATEGORY = "LNL"
    FUNCTION = "process_video"

    def process_video(
        self,
        video_path,
        force_size,
        custom_width,
        custom_height,
        prompt=None,
        unique_id=None
    ):
        prompt_inputs = prompt[unique_id]["inputs"]
        full_video_path = os.path.join(folder_paths.base_path, video_path)

        in_point = prompt_inputs["in_out_point_slider"]["startMarkerFrame"]
        out_point = prompt_inputs["in_out_point_slider"]["endMarkerFrame"]
        current_frame = prompt_inputs["in_out_point_slider"]["currentFrame"]
        total_frames = prompt_inputs["in_out_point_slider"]["totalFrames"]
        frame_rate = prompt_inputs["in_out_point_slider"]["frameRate"]

        select_every_nth_frame = prompt_inputs["select_every_nth_frame"]

        frames_to_process = out_point - in_point + 1
        starting_frame = in_point

        (current_image, _) = getImageBatch(full_video_path, 1, 1, current_frame, force_size, custom_width, custom_height)
        (in_out_images, target_frame_time) = getImageBatch(full_video_path, frames_to_process, select_every_nth_frame, starting_frame, force_size, custom_width, custom_height)

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

NODE_CLASS_MAPPINGS = {
    "LNL_FrameSelectorV3": FrameSelectorV3,
    "LNL_FrameSelectorV2": FrameSelectorV2,
    "LNL_FrameSelector": FrameSelector,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "LNL_FrameSelectorV3": "LNL Frame Selector V3",
    "LNL_FrameSelectorV2": "LNL Frame Selector V2 [Deprecated] ⛔️",
    "LNL_FrameSelector": "LNL Frame Selector [Deprecated] ⛔️",
}
