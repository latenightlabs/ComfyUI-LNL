import server
web = server.web

from .video_utils import *

@server.PromptServer.instance.routes.post("/process_video_entry")
async def my_hander_method(request):
    json_data = await request.json()
    video_path = json_data['path']

    frame_rate, total_frames = get_video_info(video_path)

    return web.json_response({"frame_rate": int(frame_rate), "total_frames": int(total_frames)})
