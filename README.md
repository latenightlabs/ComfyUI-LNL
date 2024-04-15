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

## Inputs
1. Choose Video to Upload: Select a video file for processing (in this case, 'input/logo.mp4').

## Outputs
Options include:

1. Current image: Current frame being viewed.
2. Image Batch (in/out): Select a range of frames to process based on in and out points.
3. Frame count (rel): Display the count of frames relative to in and out points.
4. Frame count (abs): Absolute count of frames in the uploaded video.
5. Current frame (rel): The current frame number relative to in and out points.
6. Current frame (abs): The absolute frame number within the entire video.
7. Frame rate: FPS in the uploaded.
8. Audio: Pass audio track if desired.

## Playback Controls
<img width="285" alt="image" src="https://github.com/latenightlabs/ComfyUI-LNL/assets/157748925/1fda10e1-9b48-4a74-abd3-4d086529cd12">

1. Double Left Arrow ("**|<**"): Takes the user to the very first frame of the video.
2. Single Left Arrow with Vertical Line ("**<|**"): Takes the user to the 'in_point', which is the frame set as the starting point for a selected range.
3. Single Left Arrow ("<"): Steps backward by one frame, moving the current frame to the previous frame in the video.
4. Triangle Pointing to the Right ("▶"): Plays the video from the current frame forward.
5. Square ("■"): Stops the playback and could either halt at the current frame or reset to a predefined position, such as the 'in_point'.
6. Single Right Arrow (">"): Steps forward by one frame at a time.
7. Single Right Arrow with Vertical Line ("|>"): Takes the user to the 'out_point', the frame set as the ending point for a selected range.
8. Double Right Arrow (">|"): Jumps to the very last frame of the video.

Frame Information: Shows the current frame number out of the total number of frames (in this instance, frame 65 of 149).

Numeric Input Fields and Controls:

current_frame: A field that likely displays the current frame number and allows you to jump to a specific frame.
in_point and out_point: Fields for setting the start and end points for a range of frames, possibly for batch processing or focused editing.
select_every_nth_frame: A field that might be used to specify a pattern for selecting frames (e.g., every 2nd frame, every 3rd frame, etc.).


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
