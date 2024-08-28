import os

from folder_paths import base_path

group_extension_folder_path = ""

def setup_version_data(group_data):
    storage_data = {
        "node_data": {},
    }

    if "nodes" in group_data:
        storage_data["node_data"]["nodes"] = group_data["nodes"]
    if "links" in group_data:
        storage_data["node_data"]["links"] = group_data["links"]
    if "group" in group_data:
        storage_data["node_data"]["group"] = group_data["group"]

    return storage_data

def setup_group_extension_folders(base_path, source_control_output_path):
    path = source_control_output_path
    if not os.path.isabs(source_control_output_path):
        path = os.path.join(base_path, source_control_output_path)
    
    if not os.path.exists(path):
        os.makedirs(path)

    return path

group_extension_folder_path = setup_group_extension_folders(base_path, "lnl_enhanced_groups")
