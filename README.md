# Load Video Scrubber & Editor Node for ComfyUI
The Late Night Labs (LNL) Scrubber & Editor node for ComfyUI is aimed at enhancing video interaction within the ComfyUI framework. It enables users to upload, playback, and perform basic In/Out on video files directly within the ComfyUI environment.

## Features
Video Upload and Playback: Users can upload video files and utilize standard playback controls including Play, Pause, Scrub, and Rewind.
Editing Tools: The node offers simple editing capabilities such as setting In/Out points for selecting specific video sections, frame selection for detailed editing, and outputting frames with handles for further processing.
Structure
The project is structured into two main components: the web directory, containing front-end JavaScript and CSS files, and the modules directory, containing back-end Python scripts.

### Web Directory
eventHandlers.js: Manages event handling for video playback and editing features.
nodes.js: Defines the Load Video Node structure and integration within ComfyUI.
utils.js: Contains utility functions for video processing and manipulation.
widgets.js: Implements UI components for video editing.
styles.js: Handles dynamic styling of the video node elements.
css/lnlNodes.css: Provides styling for the Load Video Node components.
images/: Contains icons used for playback and editing controls.

### Modules Directory
server.py: Back-end server implementation for handling video upload and processing.
utils.py: Back-end utility functions supporting video editing features.
nodes.py: Defines the server-side representation of the Load Video Node.

## Installation
Ensure you have ComfyUI and its dependencies installed.
Clone or download this repository into your \ComfyUI\custom_nodes

# To use the Load Video Node:

Navigate to the ComfyUI environment where the node is integrated.
Upload a video file using the provided upload functionality.
Utilize the playback and editing controls to interact with your video.
For detailed usage instructions, refer to the user_manual.pdf (if available) within the project directory.

Contributing
Contributions to the Load Video Node project are welcome. Please follow the contributing guidelines outlined in CONTRIBUTING.md (if available) for more information on how to contribute.

License
This project is licensed under the [LICENSE NAME] License - see the LICENSE file for details.
