import os

import torch
import numpy as np

from .utils import lnl_cv_frame_generator

import folder_paths

class FrameSelector:

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "hidden": {
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID"
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "INT", "INT",)
    RETURN_NAMES = ("Current image", "Image Batch (in/out)", "Frame count (rel)", "Frame count (abs)", "Current frame (rel)", "Current frame (abs)",)
    OUTPUT_NODE = True
    CATEGORY = "LNL"
    FUNCTION = "get_specific_frame"

    def __getImageBatch(self, full_video_path, frames_to_process, starting_frame):
        generatedImages = lnl_cv_frame_generator(full_video_path, frames_to_process, starting_frame, 1)
        (width, height, target_frame_time) = next(generatedImages)
        width = int(width)
        height = int(height)

        imageBatch = torch.from_numpy(np.fromiter(generatedImages, np.dtype((np.float32, (height, width, 3)))))
        if len(imageBatch) == 0:
            raise RuntimeError("No frames generated")
        return imageBatch

    def get_specific_frame(
        self,
        prompt=None,
        unique_id=None
    ):
        prompt_inputs = prompt[unique_id]["inputs"]
        video_path = prompt_inputs["video_path"]
        full_video_path = os.path.join(folder_paths.base_path, video_path)

        in_point = prompt_inputs["in_out_point_slider"]["startMarkerFrame"]
        out_point = prompt_inputs["in_out_point_slider"]["endMarkerFrame"]
        current_frame = prompt_inputs["in_out_point_slider"]["currentFrame"]
        total_frames = prompt_inputs["in_out_point_slider"]["totalFrames"]

        frames_to_process = out_point - in_point + 1
        starting_frame = in_point - 1

        current_image = self.__getImageBatch(full_video_path, 1, current_frame - 1)
        in_out_images = self.__getImageBatch(full_video_path, frames_to_process, starting_frame - 1)

        return (
            current_image,
            in_out_images,
            frames_to_process,
            total_frames,
            current_frame - in_point + 1,
            current_frame,
        )

NODE_CLASS_MAPPINGS = {
    "LNL_FrameSelector": FrameSelector,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "LNL_FrameSelector": "LNL Frame Selector",
}
