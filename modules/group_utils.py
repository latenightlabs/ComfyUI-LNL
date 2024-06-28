import os

from folder_paths import base_path

group_extension_folder_path = ""

def setup_group_extension_folders(base_path, source_control_output_path):
    path = source_control_output_path
    if not os.path.isabs(source_control_output_path):
        path = os.path.join(base_path, source_control_output_path)
    
    if not os.path.exists(path):
        os.makedirs(path)

    return path

group_extension_folder_path = setup_group_extension_folders(base_path, "lnl_enhanced_groups")
