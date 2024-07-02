import server
web = server.web

import json
from uuid import uuid4

from .video_utils import *
from .group_utils import group_extension_folder_path, setup_version_data
import os

@server.PromptServer.instance.routes.post("/process_video_entry")
async def route_hander_method(request):
    json_data = await request.json()
    video_path = json_data['path']

    frame_rate, total_frames = get_video_info(video_path)

    return web.json_response({"frame_rate": int(frame_rate), "total_frames": int(total_frames)})

@server.PromptServer.instance.routes.get("/fetch_groups_data")
async def route_hander_method(request):
    json_files = [file for file in os.listdir(group_extension_folder_path) if file.endswith('.json')]
    
    group_data = []
    for file in json_files:
        with open(os.path.join(group_extension_folder_path, file), 'r') as f:
            data = json.load(f)
            data["versions"] = list(map(lambda x: x["id"], sorted(data["versions"], key=lambda x: x["id"], reverse=True)))
            group_data.append(data)
    group_data = sorted(group_data, key=lambda x: x["name"])
    
    return web.json_response(group_data)

@server.PromptServer.instance.routes.get("/fetch_group_data")
async def route_hander_method(request):
    group_id = request.query.get("groupId")
    group_file = os.path.join(group_extension_folder_path, f"{group_id}.json")
    if not os.path.exists(group_file):
        return web.json_response({"error": "Group data not found"})
    
    with open(group_file, 'r') as f:
        data = json.load(f)
        data["versions"] = sorted(data["versions"], key=lambda x: x["id"], reverse=True)
    
        return web.json_response(data)

# TODO: See not to return absolutely everything loaded from the group file if not needed
@server.PromptServer.instance.routes.post("/save_group_data")
async def route_hander_method(request):
    save_as_new = request.query.get("saveAsNew") == "true"
    json_data = await request.json()
    if not "group_data" in json_data:
        return web.json_response({"error": "Invalid data"})

    group_data = json_data["group_data"]
    storage_version_data = setup_version_data(group_data)

    versioning_data = group_data["versioning_data"]
    if not "object_id" in versioning_data:
        object_id = str(uuid4())
        versioning_data["object_id"] = object_id

    group_file = os.path.join(group_extension_folder_path, f"{versioning_data['object_id']}.json")
    if not os.path.exists(group_file):
        object_version = 1
        versioning_data = {
            "object_id": versioning_data["object_id"],
            "object_name": versioning_data["object_name"],
            "object_version": object_version
        }
        storage_version_data["node_data"]["group"]["versioning_data"] = versioning_data
        fresh_file_data = {
            "id": object_id,
            "name": versioning_data["object_name"],
            "versions": [
                {
                    "id": object_version,
                    "node_data": storage_version_data["node_data"]
                }
            ],
        }
        with open(group_file, 'w') as f:
            json.dump(fresh_file_data, f, indent=4)
        return web.json_response(fresh_file_data)
    else:
        with open(group_file, 'r') as f:
            data = json.load(f)
            if save_as_new:
                data["versions"] = sorted(data["versions"], key=lambda x: x["id"], reverse=True)
                new_version_id = data["versions"][0]["id"] + 1
                new_version_data = {
                    "id": new_version_id,
                    "node_data": storage_version_data["node_data"]
                }
                new_version_data["node_data"]["group"]["versioning_data"]["object_version"] = new_version_id
                data["versions"].insert(0, new_version_data)
                with open(group_file, 'w') as f:    
                    json.dump(data, f, indent=4)
                return web.json_response(data)
            else:
                object_version = versioning_data["object_version"]
                versions = data["versions"]
                index = next((i for i, version in enumerate(versions) if version["id"] == object_version), -1)
                if index == -1:
                    return web.json_response({"error": "Version not found"})
                
                versions[index]["node_data"] = storage_version_data["node_data"]
                data["versions"] = versions
                with open(group_file, 'w') as f:    
                    json.dump(data, f, indent=4)
                return web.json_response(data)

