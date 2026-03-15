import server
web = server.web

import time
import json
import re
from uuid import uuid4
from typing import Any

from .utils import lnl_fix_path
from .video_utils import get_video_info
from .group_utils import group_extension_folder_path, setup_version_data
import os

GROUP_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def _error(message: str, status: int = 400):
    return web.json_response({"error": message}, status=status)


def _safe_load_json(file_path: str) -> Any | None:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _safe_dump_json(file_path: str, data: dict):
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def _is_valid_group_id(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return GROUP_ID_PATTERN.fullmatch(value) is not None


def _group_file_path(group_id: str) -> str:
    return os.path.join(group_extension_folder_path, f"{group_id}.json")


def _sanitize_object_name(value: Any) -> str:
    if not isinstance(value, str):
        return "Unnamed group"
    cleaned = value.strip()
    if not cleaned:
        return "Unnamed group"
    return cleaned[:200]


@server.PromptServer.instance.routes.post("/process_video_entry")
async def process_video_entry_route(request):
    try:
        json_data = await request.json()
    except Exception:
        return _error("Invalid JSON body", 400)

    video_path = json_data.get("path") if isinstance(json_data, dict) else None
    if not isinstance(video_path, str) or not video_path.strip():
        return _error("Missing or invalid 'path'", 400)

    try:
        fixed_video_path = lnl_fix_path(video_path)
        frame_rate, total_frames, duration = get_video_info(fixed_video_path)
    except Exception as e:
        return _error(f"Failed to read video info: {e}", 400)

    return web.json_response({"frame_rate": frame_rate, "total_frames": total_frames, "duration": duration})


@server.PromptServer.instance.routes.get("/fetch_groups_data")
async def fetch_groups_data_route(request):
    try:
        json_files = [file for file in os.listdir(group_extension_folder_path) if file.endswith(".json")]
    except OSError:
        return _error("Unable to read groups directory", 500)

    group_data = []
    for file in json_files:
        file_path = os.path.join(group_extension_folder_path, file)
        data = _safe_load_json(file_path)
        if not isinstance(data, dict):
            continue
        versions = data.get("versions")
        if not isinstance(versions, list):
            continue
        normalized_versions = []
        for version in sorted(versions, key=lambda x: x.get("id", 0), reverse=True):
            if not isinstance(version, dict):
                continue
            version_id = version.get("id")
            timestamp = version.get("last_change_timestamp")
            if isinstance(version_id, int):
                normalized_versions.append({"id": version_id, "timestamp": timestamp})
        group_data.append({
            "id": data.get("id"),
            "name": data.get("name", os.path.splitext(file)[0]),
            "versions": normalized_versions,
        })
    group_data = sorted(group_data, key=lambda x: str(x.get("name", "")))

    return web.json_response(group_data)


@server.PromptServer.instance.routes.get("/fetch_group_data")
async def fetch_group_data_route(request):
    group_id = request.query.get("groupId")
    if not _is_valid_group_id(group_id):
        return _error("Invalid groupId", 400)

    group_file = _group_file_path(group_id)
    if not os.path.exists(group_file):
        return _error("Group data not found", 404)

    data = _safe_load_json(group_file)
    if not isinstance(data, dict):
        return _error("Corrupted group data", 500)

    versions = data.get("versions")
    if isinstance(versions, list):
        data["versions"] = sorted(
            [v for v in versions if isinstance(v, dict)],
            key=lambda x: x.get("id", 0),
            reverse=True,
        )
    else:
        data["versions"] = []

    return web.json_response(data)


@server.PromptServer.instance.routes.post("/save_group_data")
async def save_group_data_route(request):
    save_as_new = request.query.get("saveAsNew") == "true"
    try:
        json_data = await request.json()
    except Exception:
        return _error("Invalid JSON body", 400)

    if not isinstance(json_data, dict) or "group_data" not in json_data:
        return _error("Invalid data: missing 'group_data'", 400)

    group_data = json_data.get("group_data")
    if not isinstance(group_data, dict):
        return _error("Invalid data: 'group_data' must be an object", 400)

    versioning_data = group_data.get("versioning_data")
    if versioning_data is None:
        versioning_data = {}
        group_data["versioning_data"] = versioning_data
    if not isinstance(versioning_data, dict):
        return _error("Invalid data: 'versioning_data' must be an object", 400)

    object_id = versioning_data.get("object_id")
    if object_id is None:
        object_id = str(uuid4())
        versioning_data["object_id"] = object_id
    if not _is_valid_group_id(object_id):
        return _error("Invalid object_id", 400)

    object_name = _sanitize_object_name(versioning_data.get("object_name"))
    versioning_data["object_name"] = object_name

    storage_version_data = setup_version_data(group_data)
    node_data = storage_version_data.get("node_data") if isinstance(storage_version_data, dict) else None
    if not isinstance(node_data, dict):
        return _error("Invalid group_data payload", 400)
    group_node_data = node_data.get("group")
    if not isinstance(group_node_data, dict):
        return _error("Invalid group_data: missing group serialization", 400)

    last_change_timestamp = int(time.time() * 1000)
    group_file = _group_file_path(object_id)

    if not os.path.exists(group_file):
        object_version = 1
        versioning_data = {
            "object_id": object_id,
            "object_name": object_name,
            "object_version": object_version,
        }
        group_node_data["versioning_data"] = versioning_data
        fresh_file_data = {
            "id": object_id,
            "name": object_name,
            "versions": [
                {
                    "id": object_version,
                    "last_change_timestamp": last_change_timestamp,
                    "node_data": node_data,
                }
            ],
        }
        try:
            _safe_dump_json(group_file, fresh_file_data)
        except OSError:
            return _error("Failed to write group data", 500)
        return web.json_response(fresh_file_data)

    data = _safe_load_json(group_file)
    if not isinstance(data, dict):
        return _error("Corrupted group data", 500)
    versions = data.get("versions")
    if not isinstance(versions, list):
        versions = []
    versions = [v for v in versions if isinstance(v, dict)]

    if save_as_new:
        versions = sorted(versions, key=lambda x: x.get("id", 0), reverse=True)
        latest_id = versions[0].get("id", 0) if versions else 0
        new_version_id = int(latest_id) + 1
        node_data.setdefault("group", {})
        node_data["group"]["versioning_data"] = {
            "object_id": object_id,
            "object_name": object_name,
            "object_version": new_version_id,
        }
        new_version_data = {
            "id": new_version_id,
            "last_change_timestamp": last_change_timestamp,
            "node_data": node_data,
        }
        versions.insert(0, new_version_data)
        data["versions"] = versions
        data["id"] = object_id
        data["name"] = object_name
        try:
            _safe_dump_json(group_file, data)
        except OSError:
            return _error("Failed to write group data", 500)
        return web.json_response(data)

    object_version = versioning_data.get("object_version")
    if not isinstance(object_version, int):
        return _error("Invalid object_version", 400)
    index = next((i for i, version in enumerate(versions) if version.get("id") == object_version), -1)
    if index == -1:
        return _error("Version not found", 404)

    node_data.setdefault("group", {})
    node_data["group"]["versioning_data"] = {
        "object_id": object_id,
        "object_name": object_name,
        "object_version": object_version,
    }
    versions[index]["node_data"] = node_data
    versions[index]["last_change_timestamp"] = last_change_timestamp
    data["versions"] = versions
    data["id"] = object_id
    data["name"] = object_name
    try:
        _safe_dump_json(group_file, data)
    except OSError:
        return _error("Failed to write group data", 500)
    return web.json_response(data)

