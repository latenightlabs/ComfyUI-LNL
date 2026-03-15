# LNL Frame Selector V3 for ComfyUI
The Late Night Labs (LNL) Frame Selector node enhances video interaction inside ComfyUI. It lets you upload, preview, scrub, and set In/Out points directly in the node UI, then outputs frames (and audio) for downstream processing.

## Features
- Video upload & playback (Play/Pause, step, in/out, jump).
- Timeline scrubber with In/Out markers and current frame indicator.
- Outputs for frame ranges, frame counts, current frame (abs/rel), and frame rate.
- Optional audio output for the selected range.
- Optional workflow pause to confirm trim before continuing.
- Progress overlay with step messaging while media is prepared (image sequence/audio alignment).

## Structure
The project is structured into two main components: the web directory, containing front-end JavaScript and CSS files, and the modules directory, containing back-end Python scripts.

### Web Directory
- eventHandlers.js: Manages event handling for video playback and editing features.
- nodes.js: Defines the Frame Selector node structure and integration within ComfyUI.
- utils.js: Utility functions for video processing and manipulation.
- styles.js: Dynamic styling of the video node elements.
- VideoPlayer/videoPlayer.js: Main UI logic for preview, timeline, and controls.
- css/lnlNodes.css: Styling for the Frame Selector node components.
- images/: Contains icons used for playback and editing controls.

### Modules Directory
- server.py: Back-end server implementation for handling video upload and processing.
- utils.py: Back-end utility functions supporting video editing features.
- nodes.py: Defines the server-side representation of the Frame Selector node.

## Installation
1. Ensure you have ComfyUI and its dependencies installed.
2. Clone this repo into custom_nodes:
```
$ cd ComfyUI/custom_nodes
$ git clone https://github.com/latenightlabs/ComfyUI-LNL.git
```

Install dependencies if not downloaded from the Comfy Manager:
```
$ cd ComfyUI-LNL
$ pip install -r requirements.txt
```

# Troubleshooting
- Make sure `ffmpeg`/`ffprobe` are available in your PATH.
- If numeric outputs appear as `0`, ensure the Frame Selector is connected (directly or indirectly) to an output node in the graph.

# To use the Frame Selector node:

## Inputs
1. Choose Video to Upload: Select a video file for processing (in this case, 'input/logo.mp4').
2. Optional Image Batch: Connect an IMAGE batch to use as the source instead of a file-based video.
3. Optional Audio: Connect an AUDIO input to override/externalize audio for the selected range.

Note: When an Image Batch input is connected, the video library selector and upload button are hidden.
Audio inputs are aligned to the video timeline (start at 0:0), padded/cropped to match duration, then trimmed by In/Out.

## Outputs
Options include:

1. Current image: Current frame being viewed.
2. Image Batch (in/out): Range of frames between In/Out points.
3. Frame in: In point (absolute).
4. Frame out: Out point (absolute).
5. Filename: Selected video filename.
6. Frame count (rel): Count of frames between In/Out.
7. Frame count (abs): Total frames in the video.
8. Current frame (rel): Current frame relative to In point.
9. Current frame (abs): Current frame in full video.
10. Frame rate (INT): FPS rounded to int.
11. Frame rate (FLOAT): FPS as float.
12. Audio: Audio for the selected range.

Note: Value outputs only compute when the node is connected to a downstream output node (ComfyUI execution behavior).

## Playback Controls

<img width="330" alt="image" src="https://github.com/latenightlabs/ComfyUI-LNL/assets/157748925/42f2987e-b4a5-433b-a2d1-0fd33eed03ed">

### Timeline Scrubber
1. Shows the current frame number out of the total number of frames (in this instance, frame 66 of 149).
2. In Point is green
3. Out Point is red
Note: In and Out point is set with the playback controls or in the input fields.


### Media Controls left to right:
1. Takes the user to the very first frame of the video.
2. Set 'in_point'.
3. Takes the user to the 'in_point', which is the frame set as the starting point for a selected range.
4. Steps backward by one frame, moving the current frame to the previous frame in the video.
5. Plays the video from the current frame forward.
6. _Not visible while Play button is displayed: Pause the playback at the current frame._
7. Steps forward by one frame at a time.
8. Takes the user to the 'out_point', the frame set as the ending point for a selected range.
9. Sets the 'out_point'.
10. Jumps to the very last frame of the video.

### Numeric Input Fields and Controls:

1. current_frame: Displays the current frame number and allows you to jump to a specific frame.
2. in_point and out_point: Fields for setting the start and end points for a range of frames for focused editing of a frame range.
3. select_every_nth_frame: Specify a pattern for selecting frames (e.g., every 2nd frame, every 3rd frame, etc.).


## Credits
This project uses parts of code and some ideas from the following repositories:
[ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
[ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)
Make sure to check them out, they both offer awesome tool suites!

We also use icons for player controls supplied by [Icons8](https://icons8/com).

# Contributing
Contributions to the Frame Selector project are welcome. Please open a PR with a short description and screenshots when UI changes are involved.

# License
This project is licensed under the GNU General Public License.
