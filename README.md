# Frame Selector & Sequence Selection Node for ComfyUI
The Late Night Labs (LNL) Frame Selector node for ComfyUI is aimed at enhancing video interaction within the ComfyUI framework. It enables users to upload, playback, and perform basic In/Out on video files directly within the ComfyUI environment.

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
1. Ensure you have ComfyUI and its dependencies installed.
2. Clone this repo into custom_nodes:
```
$ cd ComfyUI/custom_nodes
$ git clone https://github.com/latenightlabs/ComfyUI-LNL.git
```

Install dependencies (not needed if you have ffmpeg for AnimateDiff):
```
$ cd ComfyUI-LNL
$ pip install -r requirements.txt
```

# To use the Load Video Node:

<img width="330" alt="image" src="https://github.com/latenightlabs/ComfyUI-LNL/assets/157748925/0b1be661-44b5-441b-aba4-17a479ddd96c">


## Credits
This project uses parts of code and some ideas from the following repositories:
[ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
[ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)
Make sure to check them out, they both offer awesome tool suites!

We also use icons for player controls supplied by [Icons8](https://icons8/com).


# Contributing
Contributions to the Load Video Node project are welcome. Please 

# License
This project is licensed under the GNU General Public License.
