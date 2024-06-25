import os

import torch
import numpy as np
from .utils import lnl_cv_frame_generator, lnl_get_audio, lnl_lazy_eval

from PIL import Image

import folder_paths

"""
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):

"""
def bislerp(samples, width, height):
    def slerp(b1, b2, r):
        '''slerps batches b1, b2 according to ratio r, batches should be flat e.g. NxC'''
        
        c = b1.shape[-1]

        #norms
        b1_norms = torch.norm(b1, dim=-1, keepdim=True)
        b2_norms = torch.norm(b2, dim=-1, keepdim=True)

        #normalize
        b1_normalized = b1 / b1_norms
        b2_normalized = b2 / b2_norms

        #zero when norms are zero
        b1_normalized[b1_norms.expand(-1,c) == 0.0] = 0.0
        b2_normalized[b2_norms.expand(-1,c) == 0.0] = 0.0

        #slerp
        dot = (b1_normalized*b2_normalized).sum(1)
        omega = torch.acos(dot)
        so = torch.sin(omega)

        #technically not mathematically correct, but more pleasing?
        res = (torch.sin((1.0-r.squeeze(1))*omega)/so).unsqueeze(1)*b1_normalized + (torch.sin(r.squeeze(1)*omega)/so).unsqueeze(1) * b2_normalized
        res *= (b1_norms * (1.0-r) + b2_norms * r).expand(-1,c)

        #edge cases for same or polar opposites
        res[dot > 1 - 1e-5] = b1[dot > 1 - 1e-5] 
        res[dot < 1e-5 - 1] = (b1 * (1.0-r) + b2 * r)[dot < 1e-5 - 1]
        return res
    
    def generate_bilinear_data(length_old, length_new, device):
        coords_1 = torch.arange(length_old, dtype=torch.float32, device=device).reshape((1,1,1,-1))
        coords_1 = torch.nn.functional.interpolate(coords_1, size=(1, length_new), mode="bilinear")
        ratios = coords_1 - coords_1.floor()
        coords_1 = coords_1.to(torch.int64)
        
        coords_2 = torch.arange(length_old, dtype=torch.float32, device=device).reshape((1,1,1,-1)) + 1
        coords_2[:,:,:,-1] -= 1
        coords_2 = torch.nn.functional.interpolate(coords_2, size=(1, length_new), mode="bilinear")
        coords_2 = coords_2.to(torch.int64)
        return ratios, coords_1, coords_2

    orig_dtype = samples.dtype
    samples = samples.float()
    n,c,h,w = samples.shape
    h_new, w_new = (height, width)
    
    #linear w
    ratios, coords_1, coords_2 = generate_bilinear_data(w, w_new, samples.device)
    coords_1 = coords_1.expand((n, c, h, -1))
    coords_2 = coords_2.expand((n, c, h, -1))
    ratios = ratios.expand((n, 1, h, -1))

    pass_1 = samples.gather(-1,coords_1).movedim(1, -1).reshape((-1,c))
    pass_2 = samples.gather(-1,coords_2).movedim(1, -1).reshape((-1,c))
    ratios = ratios.movedim(1, -1).reshape((-1,1))

    result = slerp(pass_1, pass_2, ratios)
    result = result.reshape(n, h, w_new, c).movedim(-1, 1)

    #linear h
    ratios, coords_1, coords_2 = generate_bilinear_data(h, h_new, samples.device)
    coords_1 = coords_1.reshape((1,1,-1,1)).expand((n, c, -1, w_new))
    coords_2 = coords_2.reshape((1,1,-1,1)).expand((n, c, -1, w_new))
    ratios = ratios.reshape((1,1,-1,1)).expand((n, 1, -1, w_new))

    pass_1 = result.gather(-2,coords_1).movedim(1, -1).reshape((-1,c))
    pass_2 = result.gather(-2,coords_2).movedim(1, -1).reshape((-1,c))
    ratios = ratios.movedim(1, -1).reshape((-1,1))

    result = slerp(pass_1, pass_2, ratios)
    result = result.reshape(n, h_new, w_new, c).movedim(-1, 1)
    return result.to(orig_dtype)

def lanczos(samples, width, height):
    images = [Image.fromarray(np.clip(255. * image.movedim(0, -1).cpu().numpy(), 0, 255).astype(np.uint8)) for image in samples]
    images = [image.resize((width, height), resample=Image.Resampling.LANCZOS) for image in images]
    images = [torch.from_numpy(np.array(image).astype(np.float32) / 255.0).movedim(-1, 0) for image in images]
    result = torch.stack(images)
    return result.to(samples.device, samples.dtype)

def common_upscale(samples, width, height, upscale_method, crop):
        if crop == "center":
            old_width = samples.shape[3]
            old_height = samples.shape[2]
            old_aspect = old_width / old_height
            new_aspect = width / height
            x = 0
            y = 0
            if old_aspect > new_aspect:
                x = round((old_width - old_width * (new_aspect / old_aspect)) / 2)
            elif old_aspect < new_aspect:
                y = round((old_height - old_height * (old_aspect / new_aspect)) / 2)
            s = samples[:,:,y:old_height-y,x:old_width-x]
        else:
            s = samples

        if upscale_method == "bislerp":
            return bislerp(s, width, height)
        elif upscale_method == "lanczos":
            return lanczos(s, width, height)
        else:
            return torch.nn.functional.interpolate(s, size=(height, width), mode=upscale_method)

def getImageBatch(full_video_path, force_rate, frames_to_process, select_every_nth_frame, starting_frame, force_size, custom_width, custom_height):
    generatedImages = lnl_cv_frame_generator(full_video_path, force_rate, frames_to_process, starting_frame, select_every_nth_frame)
    (width, height, target_frame_time) = next(generatedImages)
    width = int(width)
    height = int(height)

    imageBatch = torch.from_numpy(np.fromiter(generatedImages, np.dtype((np.float32, (height, width, 3)))))
    if len(imageBatch) == 0:
        raise RuntimeError("No frames generated")

    if force_size != "Disabled":
        new_size = target_size(width, height, force_size, custom_width, custom_height)
        if new_size[0] != width or new_size[1] != height:
            s = imageBatch.movedim(-1,1)
            s = common_upscale(s, new_size[0], new_size[1], "lanczos", "center")
            imageBatch = s.movedim(1,-1)

    return (imageBatch, target_frame_time)

def target_size(width, height, force_size, custom_width, custom_height) -> tuple[int, int]:
    if force_size == "Custom":
        return (custom_width, custom_height)
    elif force_size == "Custom Height":
        force_size = "?x"+str(custom_height)
    elif force_size == "Custom Width":
        force_size = str(custom_width)+"x?"

    if force_size != "Disabled":
        force_size = force_size.split("x")
        if force_size[0] == "?":
            width = (width*int(force_size[1]))//height
            #Limit to a multple of 8 for latent conversion
            width = int(width)+4 & ~7
            height = int(force_size[1])
        elif force_size[1] == "?":
            height = (height*int(force_size[0]))//width
            height = int(height)+4 & ~7
            width = int(force_size[0])
        else:
            width = int(force_size[0])
            height = int(force_size[1])
    return (width, height)

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
        starting_frame = in_point - 1

        (current_image, _) = getImageBatch(full_video_path, 0, 1, 1, current_frame - 1, "Disabled", 0, 0)
        (in_out_images, target_frame_time) = getImageBatch(full_video_path, 0, frames_to_process, select_every_nth_frame, starting_frame, "Disabled", 0, 0)

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
        v2_input_types["required"]["force_rate"] = ("INT", {"default": 0, "min": 0, "max": 60, "step": 1})
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
        force_rate,
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
        starting_frame = in_point - 1

        (current_image, _) = getImageBatch(full_video_path, 0, 1, 1, current_frame - 1, force_size, custom_width, custom_height)
        (in_out_images, target_frame_time) = getImageBatch(full_video_path, force_rate, frames_to_process, select_every_nth_frame, starting_frame, force_size, custom_width, custom_height)

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
