import subprocess
import os

import folder_paths

import server
web = server.web

from .utils import ffmpeg_path

def _get_video_info(video_path):
    # TODO: Make sure ffmpeg is installed (Add this to readme)
    if ffmpeg_path is None:
        raise Exception("FFMPEG path not set")

    full_video_path = os.path.join(folder_paths.base_path, video_path)
    if not os.path.exists(full_video_path):
        raise Exception(f"Video path does not exist: {full_video_path}")

    cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
           '-show_entries', 'stream=r_frame_rate,nb_frames', '-of', 'default=noprint_wrappers=1:nokey=1',
           full_video_path]
    process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    output = process.stdout.splitlines()

    frame_rate_str = output[0]
    try:
        num, den = map(int, frame_rate_str.split('/'))
        frame_rate = num / den
    except ValueError:
        frame_rate = float(frame_rate_str)

    total_frames = output[1]

    return frame_rate, total_frames

@server.PromptServer.instance.routes.post("/process_video_entry")
async def my_hander_method(request):
    json_data = await request.json()
    video_path = json_data['path']

    frame_rate, total_frames = _get_video_info(video_path)

    return web.json_response({"frame_rate": int(frame_rate), "total_frames": int(total_frames)})
