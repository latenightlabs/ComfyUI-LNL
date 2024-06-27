import server
web = server.web

import json

from .video_utils import *
from .group_utils import group_extension_folder_path
import os

@server.PromptServer.instance.routes.post("/process_video_entry")
async def my_hander_method(request):
    json_data = await request.json()
    video_path = json_data['path']

    frame_rate, total_frames = get_video_info(video_path)

    return web.json_response({"frame_rate": int(frame_rate), "total_frames": int(total_frames)})

@server.PromptServer.instance.routes.get("/fetch_groups_data")
async def my_hander_method(request):
    json_files = [file for file in os.listdir(group_extension_folder_path) if file.endswith('.json')]
    
    group_data = []
    for file in json_files:
        with open(os.path.join(group_extension_folder_path, file), 'r') as f:
            data = json.load(f)
            data["versions"] = sorted(data["versions"], key=lambda x: x["id"], reverse=True)
            group_data.append(data)
    group_data = sorted(group_data, key=lambda x: x["name"])
    
    return web.json_response(group_data)
