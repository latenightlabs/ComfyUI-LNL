# Frame Selector & Sequence Selection Node for ComfyUI
The Late Night Labs (LNL) Frame Selector node for ComfyUI is aimed at enhancing video interaction within the ComfyUI framework. It enables users to upload, playback, and perform basic In/Out on video files directly within the ComfyUI environment.

## Features
- Video Upload and Playback: Users can upload video files and utilize standard playback controls including Play, Pause, Scrub, and Rewind.
- Editing Tools: The node offers simple editing capabilities such as setting In/Out points for selecting specific video sections, frame selection for detailed editing, and outputting frames with handles for further processing. Audio can be included.

## Structure
The project is structured into two main components: the web directory, containing front-end JavaScript and CSS files, and the modules directory, containing back-end Python scripts.

### Web Directory
- eventHandlers.js: Manages event handling for video playback and editing features.
- nodes.js: Defines the Load Video Node structure and integration within ComfyUI.
- utils.js: Contains utility functions for video processing and manipulation.
- widgets.js: Implements UI components for video editing.
- styles.js: Handles dynamic styling of the video node elements.
- css/lnlNodes.css: Provides styling for the Load Video Node components.
- images/: Contains icons used for playback and editing controls.

### Modules Directory
- server.py: Back-end server implementation for handling video upload and processing.
- utils.py: Back-end utility functions supporting video editing features.
- nodes.py: Defines the server-side representation of the Load Video Node.

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
Make sure you that you have ffmpeg defined in your path.

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
7. Framerate: FPS in the uploaded video.
8. Audio: Pass audio track if desired.

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

# Enhanced Groups with Versioning Support for ComfyUI
This project aims to provide the users with a possibilty to create custom components (specific group versions) which can be reused throughout different projects, or used in different places within the same project. Users can also take advantage of using different versions of the same group/component in the same workflow. Going forward, we're going to be referencing these versioned groups as components.

## Adding a ComfyUI group or a Component
By right-clicking on an empty canvas, you're presented with a context menu where the `Add Group` option is presented. By default, ComfyUI creates an empty group called `Group` when you tap that option. Due to installing this library, you'll be taken to another submenu offering options of `Empty group` (the default empty group ComfyUI creates) and a `Versioned group`. Selecting the `Versioned group` option, you'll see all of the components listed (the latest version of each component). If you've just installed this library, you won't see any components because we haven't created any yet.

![Adding a ComfyUI group or a Component](https://github.com/user-attachments/assets/bfbcf083-93d7-43b7-9701-ea85f4f73450)

## Creating a component
Let's create an empty ComfyUI group by right-clicking an empty canvas, selecting `Add Group` -> `Empty group`. You can name the group anything you like e.g. `Test group`. Bear in mind that the group name isn't tied to the component name, meaning each component version can have a different group name.

Add a `Load image` node (use the default `example.png` image pre-installed with ComfyUI), and connect it to a `Preview image` node. Make sure both are inside our group. Right-click inside our group, and select `Edit Group` -> `Versions` -> `Save`.

![Creating a component 01](https://github.com/user-attachments/assets/4a29b1b2-0ec6-498b-bf6f-e5c977746e7c)

Once selected, you'll be asked to enter a component name. Let's call it `First component` and hit `OK`.

![Creating a component 02](https://github.com/user-attachments/assets/33804fbb-afe7-4136-bf8d-a11358b4d06d)

This will create a component out of this group, and you'll see additional info in the group header appear, such as the component name and component version.

![Creating a component 03](https://github.com/user-attachments/assets/903ab107-40c4-4785-a8a1-8d57811901f0)

## Loading a component
Now, once our component is created, let's clear the workflow by selecting `Clear` from the ComfyUI menu. Right-click on an empty canvas again, and from `Add Group` -> `Versioned group` select our component. 

![Loading a component 01](https://github.com/user-attachments/assets/8b3929a8-938a-4199-98fd-8097c6765fcb)

This will add our previously saved component to the workflow. You can do it a couple of times more, e.g. twice, to add the component on different parts of the canvas.

![Loading a component 02](https://github.com/user-attachments/assets/55756640-c101-4fbf-ab99-4dc8d3593aff)

## Saving a new version of the component
Let's select one of our component's and shuffle the nodes around a bit, maybe even change the group size and name. We'll do it on the left topmost one for our example. 

![Saving a new version of the component 01](https://github.com/user-attachments/assets/7aca3cf4-8061-482f-9767-d6b057e9a935)

Now, once the changes have been made, right-click on the group, and select `Edit Group` -> `Versions` -> `Save as new version`. This will create a new version of our component, version 2. The changes will also be reflected in the group's header.

![Saving a new version of the component 02](https://github.com/user-attachments/assets/124c665e-416f-4a72-8914-75f9b7a32f3f)

Do note that, should you wish to add another component to the workflow, you'll be offered to add the component's last version (as initially mentioned). That would now be the version 2.

![Saving a new version of the component 03](https://github.com/user-attachments/assets/7a813c7b-c62a-4092-a080-e8810e5c3426)

## Loading a specific component version
By now, we've already seen how to add the latest component version to our workflow. But if we want to load a specific version, we must right-click on the group and select `Edit Group` -> `Versions` -> `Load version` and select a specific version. To make navigating different versions easier, each version is labeled with its last change date and time.

![Loading a specific component version version 01](https://github.com/user-attachments/assets/cbfa46e2-732e-4f6b-bacd-1e6db9505df3)

In our example, let's load v2 in our top-right component. We'll end up with two v2 `First component` components and one v1 `First component` component.

![Loading a specific component version 02](https://github.com/user-attachments/assets/0a312bdb-d870-44ae-872b-007bd494172d)

## Undoing changes to a specific component version
Provided we've made some changes to one of our components but haven't saved them (can be the latest or one of the previous versions) and we want to undo them, we can select `Edit Group` -> `Versions` -> `Refresh`. In our example, we chose to modify the bottom-right component's node locations and the group title. Selecting `Refresh` will reset the changes, or rather reload the v1 of the component.

![Undoing changes to a specific component version](https://github.com/user-attachments/assets/7d2d4c6d-368e-414e-9be8-af9385e55e93)

## Refreshing a component due to a change in a different place
If we've changed a component in a different part of a workflow (or even in a different workflow altogether), and wish to update a component with that same version, we can select the `Refresh` option from the example above as well.

# Contributing
Contributions to the Load Video Node project are welcome. Please 

# License
This project is licensed under the GNU General Public License.
