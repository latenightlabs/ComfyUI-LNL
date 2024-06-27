import os

from folder_paths import base_path

def setup_group_extension_folders(base_path, source_control_output_path):
    path = source_control_output_path
    if not os.path.isabs(source_control_output_path):
        path = os.path.join(base_path, source_control_output_path)
    
    if not os.path.exists(path):
        os.makedirs(path)

    return path

setup_group_extension_folders(base_path, "lnl_extended_groups")
