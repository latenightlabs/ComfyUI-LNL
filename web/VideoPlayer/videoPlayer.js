'use strict';

import { app } from "../../../scripts/app.js"; // For LiteGraph
import { api } from "../../../scripts/api.js";
import { $el } from "../../../scripts/ui.js";
import { createSpinner } from "../../../scripts/ui/spinner.js";

import { clamp, lnlGetUrl, lnlUploadFile } from "../utils.js";
import { getLNLPositionStyle } from "../styles.js";
import { handleLNLMouseEvent } from "../eventHandlers.js";
import { processVideoEntry } from "../utils.js";

// Double slider widget
function createDoubleSliderWidget(hostNode, widgetName) {
    const doubleSliderWidget = {
        type: "double_slider",
        name: widgetName,
        options: { min: 0, max: 100, step: 1, precision: 1, read_only: false },
        value: { current: 0 , startMarkerFrame: 0, endMarkerFrame: 100, currentFrame: 1, totalFrames: 1 },
        marker: true,
        draw(ctx, node, widget_width, y, widget_height) { 
            Object.assign(this.inputEl.style, getLNLPositionStyle(ctx, widget_width, y, node, widget_height));
        },
        onWidgetChanged(widget_name, new_value, old_value, widget) {
            console.log(`Widget ${widget_name} changed from ${old_value} to ${new_value}`);
        },
        mouse(event, pos, node) {
            return handleLNLMouseEvent(event, pos, node, this.positionUpdatedCallback);
        },
    };
    doubleSliderWidget.inputEl = $el("doubleSliderWidget", { src: null });
    doubleSliderWidget.positionUpdatedCallback = (value) => {
        pauseVideoIfPlaying(hostNode.previewWidget, hostNode.playerControlsWidget);
        const frameAtValue = hostNode.previewWidget.videoEl.getFrameForNValue(value);
        const clampedValue = clamp(frameAtValue, 1, doubleSliderWidget.value.totalFrames);
        hostNode.previewWidget.videoEl.setCurrentFrame(clampedValue);
    };    
    
    return doubleSliderWidget;
}

// Player controls widget
const PlayerControls = {
    gotoStart: 0,
    setInPoint: 1,
    gotoInPoint: 2,
    stepBackward: 3,
    playPause: 4,
    stepForward: 5,
    gotoOutPoint: 6,
    setOutPoint: 7,
    gotoEnd: 8,
};

function createPlayerControlsWidget(widgetName, hostNode, controlClickHandler) {
    const element = document.createElement("div");
    const playerControlsWidget = hostNode.addDOMWidget(widgetName, "player_controls_widget", element, {
        serialize: false,
        hideOnZoom: false,
    });
    playerControlsWidget.computeSize = function (width) {
        return [width, LiteGraph.NODE_WIDGET_HEIGHT * 2];
    }
    playerControlsWidget.parentEl = document.createElement("div");
    playerControlsWidget.parentEl.className = "player-controls-container";
    element.appendChild(playerControlsWidget.parentEl);

    playerControlsWidget.controlsEl = document.createElement("div");
    playerControlsWidget.controlsEl.className = "player-grid-container";
    playerControlsWidget.parentEl.appendChild(playerControlsWidget.controlsEl);

    // Images downloaded from Icons8 (https://icons8/com).
    const images = [
        lnlGetUrl("../images/goto_start.png", import.meta.url),
        lnlGetUrl("../images/set_in_point.png", import.meta.url),
        lnlGetUrl("../images/goto_in_point.png", import.meta.url),
        lnlGetUrl("../images/step_backward.png", import.meta.url),
        lnlGetUrl("../images/pause.png", import.meta.url),
        lnlGetUrl("../images/step_forward.png", import.meta.url),
        lnlGetUrl("../images/goto_out_point.png", import.meta.url),
        lnlGetUrl("../images/set_out_point.png", import.meta.url),
        lnlGetUrl("../images/goto_end.png", import.meta.url),
    ];
    const tooltips = [
        "Go to start",
        "Set in-point",
        "Go to in-point",
        "Step backward",
        "Play/Pause",
        "Step forward",
        "Go to out-point",
        "Mark out-point",
        "Go to end",
    ];
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement("div");
        cell.title = tooltips[i];
        cell.innerHTML = `<img class="player-grid-item" src="${images[i]}" />`;
        playerControlsWidget.controlsEl.appendChild(cell);

        cell.addEventListener("mousedown", function () {
            this.style.opacity = 0.7;
            if (controlClickHandler) {
                controlClickHandler(i);
            }
        });
        cell.addEventListener("mouseup", function () {
            this.style.opacity = 1.0;
        });
        cell.addEventListener("mouseleave", function () {
            this.style.opacity = 1.0;
        });
        cell.addEventListener("touchstart", function (e) {
            this.style.opacity = 0.7;
            e.preventDefault();
            if (controlClickHandler) {
                controlClickHandler(i);
            }
        });
        cell.addEventListener("touchend", function (e) {
            this.style.opacity = 1.0;
            e.preventDefault();
        });
    }

    return playerControlsWidget;
}

// Video preview widget
function createVideoPreviewWidget(hostNode) {
    const infiniteAR = 1000;
    const element = document.createElement("div");
    const previewWidget = hostNode.addDOMWidget("video_preview_widget", "preview", element, {
        serialize: false,
        hideOnZoom: false,
        getValue() {
            return element.value;
        },
        setValue(v) {
            element.value = v;
        },
    });

    previewWidget.computeSize = function (width) {
        if (this.aspectRatio && !this.parentEl.hidden) {
            let height = (hostNode.size[0] - 20) / this.aspectRatio + 10;
            if (!(height > 0)) {
                height = 0;
            }
            this.computedHeight = height + 10;
            return [width, height];
        }
        return [width, -4];
    }
    previewWidget.aspectRatio = infiniteAR;
    previewWidget.value = { hidden: false, paused: false, params: {} }
    previewWidget.parentEl = document.createElement("div");
    previewWidget.parentEl.style['position'] = "relative";
    previewWidget.parentEl.style['width'] = "100%"
    element.appendChild(previewWidget.parentEl);
    previewWidget.videoEl = document.createElement("video");
    previewWidget.videoEl.controls = false;
    previewWidget.videoEl.loop = false;
    previewWidget.videoEl.muted = true;
    previewWidget.videoEl.style['width'] = "100%"
    previewWidget.videoEl.style['pointer-events'] = "none"

    previewWidget.videoEl.addEventListener("loadedmetadata", async () => {
        previewWidget.aspectRatio = previewWidget.videoEl.videoWidth / previewWidget.videoEl.videoHeight;
        previewWidget.loaderEl.style['visibility'] = "visible";

        let params = {}
        Object.assign(params, previewWidget.value.params);
        if (params.filename) {
            const jsonData = await processVideoEntry(params.filename, previewWidget.videoEl.duration);
            if (jsonData) {
                previewWidget.loaderEl.style['visibility'] = "hidden";

                [hostNode.inPointWidget, hostNode.outPointWidget, hostNode.currentFrameWidget].forEach((widget) => {
                    widget.options.min = 1;
                    widget.options.max = jsonData.total_frames;    
                });

                const componentCreated = hostNode.componentCreated;
                const componentLoadedOrRefreshed = hostNode.currentFrameWidget.value != -1;
                previewWidget.value.params.frameDuration = jsonData.frame_duration;
                previewWidget.value.params.totalFrames = jsonData.total_frames;
                hostNode.doubleSliderWidget.value.frameRate = jsonData.frame_rate;
                if (!componentCreated) {
                    hostNode.doubleSliderWidget.value.startMarkerFrame = 1;
                    hostNode.doubleSliderWidget.value.endMarkerFrame = jsonData.total_frames;
                    
                    hostNode.inPointWidget.value = 1;
                    hostNode.outPointWidget.value = jsonData.total_frames;

                    updateSliderValues(hostNode.doubleSliderWidget, hostNode, 1, jsonData.total_frames);
                }
                else {
                    if (!componentLoadedOrRefreshed) {
                        // Component is created from scratch, not loaded or refreshed
                        hostNode.currentFrameWidget.value = hostNode.currentFrameWidget.options.min;
                        hostNode.inPointWidget.value = hostNode.inPointWidget.options.min;
                        hostNode.outPointWidget.value = hostNode.outPointWidget.options.max;
                    }

                    previewWidget.videoEl.setCurrentFrame(hostNode.currentFrameWidget.value);
                    previewWidget.videoEl.setInPoint(hostNode.inPointWidget.value);
                    previewWidget.videoEl.setOutPoint(hostNode.outPointWidget.value);
                    updateSliderValues(hostNode.doubleSliderWidget, hostNode, hostNode.currentFrameWidget.value, previewWidget.value.params.totalFrames);
                }

                let lastTime = 0;
                function checkFrame() {
                    if (previewWidget.videoEl.currentTime !== lastTime) {
                        lastTime = previewWidget.videoEl.currentTime;
                        
                        const currentTime = previewWidget.videoEl.currentTime;
                        const currentFrame = Math.round(currentTime / jsonData.frame_duration);
                        hostNode.currentFrameWidget.value = currentFrame;
                        updateSliderValues(hostNode.doubleSliderWidget, hostNode, currentFrame, jsonData.total_frames);
                    }
                    requestAnimationFrame(checkFrame);
                }
                previewWidget.videoEl.addEventListener('playing', (event) => {
                    checkFrame();

                    hostNode.doubleSliderWidget.pointerIsDown = false;
                });
                previewWidget.videoEl.addEventListener('ended', (event) => {
                    setPlayIcon(hostNode.playerControlsWidget);
                });                    
                
                if (!componentCreated || (componentCreated && !componentLoadedOrRefreshed)) {
                    previewWidget.videoEl.play();
                    setPauseIcon(hostNode.playerControlsWidget);
                }
                else {
                    checkFrame();
                    setPlayIcon(hostNode.playerControlsWidget);
                }
            }
        }
        setTimeout(() => {
            lnl_fitHeight(hostNode);
        }, 10);
    });
    
    previewWidget.videoEl.addEventListener("error", () => {
        previewWidget.aspectRatio = infiniteAR;
        previewWidget.loaderEl.style['visibility'] = "hidden";

        setTimeout(() => {
            previewWidget.value.params.frameDuration = 1;
            previewWidget.value.params.totalFrames = 1;

            hostNode.currentFrameWidget.value = 1;
            hostNode.inPointWidget.value = 1;
            hostNode.outPointWidget.value = 1;

            hostNode.doubleSliderWidget.value.startMarkerFrame = 1;
            hostNode.doubleSliderWidget.value.endMarkerFrame = 1;
            hostNode.doubleSliderWidget.value.frameRate = 1;

            if (this) {
                this.currentTime = 1;
            }

            updateSliderValues(hostNode.doubleSliderWidget, hostNode, 1, 1);
            lnl_fitHeight(hostNode);
        }, 100);
    });

    previewWidget.updateSource = function () {
        let params = {}
        Object.assign(params, this.value.params);
        this.parentEl.hidden = this.value.hidden;
        this.videoEl.autoplay = false;
        let target_width = 256
        if (element.style?.width) {
            target_width = element.style.width.slice(0, -2) * 2;
        }
        if (!params.force_size || params.force_size.includes("?") || params.force_size == "Disabled") {
            params.force_size = target_width + "x?"
        } else {
            let size = params.force_size.split("x")
            let ar = parseInt(size[0]) / parseInt(size[1])
            params.force_size = target_width + "x" + (target_width / ar)
        }
        previewWidget.videoEl.src = api.apiURL('/view?' + new URLSearchParams(params));
        this.videoEl.hidden = false;
    }

    previewWidget.updateParameters = (params) => {
        Object.assign(previewWidget.value.params, params)
        previewWidget.updateSource();
    };      
    previewWidget.parentEl.appendChild(previewWidget.videoEl);

    previewWidget.videoEl.getFrameForNValue = function (nvalue) {
        const frameAtValue = Math.round(nvalue * previewWidget.value.params.totalFrames / 100);
        return frameAtValue;
    };

    previewWidget.videoEl.getCurrentFrame = function () {
        const currentFrame = Math.round(this.currentTime / previewWidget.value.params.frameDuration);
        return currentFrame;
    };
    previewWidget.videoEl.getStartFrame = function () {
        const startFrame = 1;
        return startFrame;
    };
    previewWidget.videoEl.getInPointFrame = function () {
        const inFrame = hostNode.doubleSliderWidget.value.startMarkerFrame;
        return inFrame;
    };
    previewWidget.videoEl.getOutPointFrame = function () {
        const outFrame = hostNode.doubleSliderWidget.value.endMarkerFrame;
        return outFrame;
    };
    previewWidget.videoEl.getEndFrame = function () {
        const endFrame = previewWidget.value.params.totalFrames;
        return endFrame;
    };
    previewWidget.videoEl.setCurrentFrame = function (frame) {
        const clampedFrame = clamp(frame, 1, hostNode.doubleSliderWidget.value.totalFrames);
        this.currentTime = clampedFrame * previewWidget.value.params.frameDuration;
        hostNode.currentFrameWidget.value = clampedFrame;
    };
    previewWidget.videoEl.advanceOneFrame = function () {
        const endFrame = this.getEndFrame();
        const nextFrame = Math.min(this.getCurrentFrame() + 1, endFrame);
        this.setCurrentFrame(nextFrame);
    };
    previewWidget.videoEl.regressOneFrame = function () {
        const startFrame = this.getStartFrame();
        const previousFrame = Math.max(this.getCurrentFrame() - 1, startFrame);
        this.setCurrentFrame(previousFrame);
    };
    previewWidget.videoEl.gotoInPoint = function () {
        const inFrame = this.getInPointFrame();
        this.setCurrentFrame(inFrame);
    };
    previewWidget.videoEl.gotoOutPoint = function () {
        const outFrame = this.getOutPointFrame();
        this.setCurrentFrame(outFrame);
    };
    previewWidget.videoEl.gotoStart = function () {
        const startFrame = this.getStartFrame();
        this.setCurrentFrame(startFrame);
    };
    previewWidget.videoEl.gotoEnd = function () {
        const endFrame = this.getEndFrame();
        this.setCurrentFrame(endFrame);
    };
    previewWidget.videoEl.setInPoint = function (value) {
        const currentFrame = this.getCurrentFrame();
        const valueToSet = value ? value : currentFrame;
        hostNode.doubleSliderWidget.value.startMarkerFrame = valueToSet;
        hostNode.inPointWidget.value = valueToSet;

        const outPointFrame = this.getOutPointFrame();
        if (valueToSet > outPointFrame) {
            hostNode.doubleSliderWidget.value.endMarkerFrame = this.getEndFrame();
            hostNode.outPointWidget.value = this.getEndFrame();
        }
    };
    previewWidget.videoEl.setOutPoint = function (value) {
        const currentFrame = this.getCurrentFrame();
        const valueToSet = value ? value : currentFrame;
        hostNode.doubleSliderWidget.value.endMarkerFrame = valueToSet;
        hostNode.outPointWidget.value = valueToSet;

        const inPointFrame = this.getInPointFrame();
        if (valueToSet < inPointFrame) {
            hostNode.doubleSliderWidget.value.startMarkerFrame = this.getStartFrame();
            hostNode.inPointWidget.value = this.getStartFrame();
        }
    };
    previewWidget.playPauseTriggeredCallback = () => {
        updatePlayPauseControl(previewWidget, hostNode.playerControlsWidget)
    };

    createLoaderOverlay(previewWidget);
    return previewWidget;
}

// Video preview widget helpers
function createLoaderOverlay(previewWidget) {
    previewWidget.playPauseOverlayEl = document.createElement("div");
    previewWidget.playPauseOverlayEl.className = "video-loading-overlay-container";
    previewWidget.playPauseOverlayEl.addEventListener('click', function () {
        previewWidget.playPauseTriggeredCallback?.call();
        if (!isVideoPlaying(previewWidget)) {
            previewWidget.videoEl.play();
        } else {
            previewWidget.videoEl.pause();
        }
    });
    previewWidget.parentEl.appendChild(previewWidget.playPauseOverlayEl);

    previewWidget.loaderEl = document.createElement("div");
    previewWidget.loaderEl.className = "video-loading-overlay";
    previewWidget.parentEl.appendChild(previewWidget.loaderEl);

    previewWidget.spinnerEl = document.createElement("div");
    previewWidget.spinnerEl.className = "video-loading-spinner";
    previewWidget.spinnerEl.innerHTML = createSpinner().outerHTML + "<br />Processing...";
    previewWidget.loaderEl.appendChild(previewWidget.spinnerEl);
}

// Utility
function updateSliderValues(widget, node, currentFrame, totalFrames) {
    widget.value.current = (currentFrame / totalFrames) * 100;
    widget.value.currentFrame = currentFrame;
    widget.value.totalFrames = totalFrames;
    widget.label = `Frame: ${currentFrame} / ${totalFrames}`;
    node.graph?.setDirtyCanvas(true);
}

function updatePlayPauseControl(previewWidget, playerControlsWidget) {
    isVideoPlaying(previewWidget)
        ? setPlayIcon(playerControlsWidget)
        : setPauseIcon(playerControlsWidget);
}

function setPlayIcon(playerControlsWidget) {
    const imageHTML = `<img class="player-grid-item" src="${lnlGetUrl("../images/play.png", import.meta.url)}" />`;
    assignPlayPauseControlImage(playerControlsWidget, imageHTML);
}

function setPauseIcon(playerControlsWidget) {
    const imageHTML = `<img class="player-grid-item" src="${lnlGetUrl("../images/pause.png", import.meta.url)}" />`;
    assignPlayPauseControlImage(playerControlsWidget, imageHTML);
}

function assignPlayPauseControlImage(playerControlsWidget, imageHTML) {
    playerControlsWidget.controlsEl.children[PlayerControls.playPause].innerHTML = imageHTML;
    playerControlsWidget.controlsEl.children[PlayerControls.playPause].style.opacity = 1.0;
}

function isVideoPlaying(previewWidget) {
    return !(previewWidget.videoEl.paused || previewWidget.videoEl.ended);
}

function pauseVideoIfPlaying(previewWidget, playerControlsWidget) {
    if (!isVideoPlaying(previewWidget)) {
        return;
    }
    updatePlayPauseControl(previewWidget, playerControlsWidget);
    previewWidget.videoEl.pause();
}


/*
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):
*/
function createUploadWidget(hostNode, pathWidget) {
    const fileInput = document.createElement("input");
    Object.assign(fileInput, {
        type: "file",
        accept: "video/webm,video/mp4,video/mkv",
        style: "display: none",
        onchange: async () => {
            if (fileInput.files.length) {
                if (await lnlUploadFile(fileInput.files[0]) != 200) {
                    //upload failed and file can not be added to options
                    return;
                }
                const filename = fileInput.files[0].name;
                const fullFilePath = `input/${filename}`;
                pathWidget.options.values.push(fullFilePath);
                pathWidget.options.values.sort();
                pathWidget.value = fullFilePath;
                if (pathWidget.callback) {
                    pathWidget.callback(fullFilePath)
                }
            }
        },
    });
    document.body.append(fileInput);
    let uploadWidget = hostNode.addWidget("button", "choose video to upload", "image", () => {
        //clear the active click event
        app.canvas.node_widget = null

        fileInput.click();
    });
    uploadWidget.options.serialize = false;
    return uploadWidget;
}

/*
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):
*/
function injectHidden(widget) {
    widget.computeSize = (target_width) => {
        if (widget.hidden) {
            return [0, -4];
        }
        return [target_width, 20];
    };
    widget._type = widget.type
    Object.defineProperty(widget, "type", {
        set : function(value) {
            widget._type = value;
        },
        get : function() {
            if (widget.hidden) {
                return "hidden";
            }
            return widget._type;
        }
    });
    widget.hidden = true;
}

function updateCustomSizeLogic(sizeWidget, customWidthWidget, customHeightWidget) {
    switch (sizeWidget.value) {
        case "Custom Width":
            customWidthWidget.hidden = false;
            customHeightWidget.hidden = true;
            break;
        case "Custom Height":
            customWidthWidget.hidden = true;
            customHeightWidget.hidden = false;
            break;
        case "Custom":
            customWidthWidget.hidden = false;
            customHeightWidget.hidden = false;
            break;
        default:
            customWidthWidget.hidden = true;
            customHeightWidget.hidden = true;
            break;
    }
}

// Create widgets
export async function createFrameSelectorWidgets(nodeType) {
    const originalNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        originalNodeCreated?.apply(this, arguments);

        const that = this;

        // Create double slider widget
        const doubleSliderWidget = createDoubleSliderWidget(this, "in_out_point_slider");
        this.doubleSliderWidget = doubleSliderWidget;
        updateSliderValues(doubleSliderWidget, this, 1, 1);

        // Add path widget
        const pathWidget = this.widgets.find((w) => w.name === "video_path");
        pathWidget.callback = (value, componentCreated) => {
            if (typeof componentCreated === "boolean" && componentCreated === true) {
                this.componentCreated = true;
            }
            else {
                this.componentCreated = false;
            }
            if (!value) {
                that.previewWidget.updateParameters({});
                return;
            }
            
            let extension_index = value.lastIndexOf(".");
            let extension = value.slice(extension_index+1);
            let format = "video"
            format += "/" + extension;
            let params = {filename : value, type: "input", format: format};
            that.previewWidget.updateParameters(params);
        };
        this.pathWidget = pathWidget;

        // Add upload widget
        const uploadWidget = createUploadWidget(this, pathWidget);
        this.uploadWidget = uploadWidget;

        /*
        Attribution: ComfyUI-VideoHelperSuite

        Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
        which is licensed under the GNU General Public License version 3 (GPL-3.0):
        */
        // Add video preview widget
        const previewWidget = createVideoPreviewWidget(this);
        this.previewWidget = previewWidget;

        const sizeWidget = this.widgets.find((w) => w.name === 'force_size');
        const customWidthWidget = this.widgets.find((w) => w.name === 'custom_width');
        const customHeightWidget = this.widgets.find((w) => w.name === 'custom_height');
        if (sizeWidget !== undefined) {
            injectHidden(customWidthWidget);
            injectHidden(customHeightWidget);
            sizeWidget.callback = (value) => {
                updateCustomSizeLogic(sizeWidget, customWidthWidget, customHeightWidget);
                lnl_fitHeight(that);
            };
        }

        // Add double slider widget
        document.body.appendChild(doubleSliderWidget.inputEl);
        this.addCustomWidget(doubleSliderWidget);

        // Create player controls widget
        const playerControlsWidget = createPlayerControlsWidget("player_controls", that, (control) => {
            switch (control) {
                case PlayerControls.gotoStart:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoStart();
                    break;
                case PlayerControls.setInPoint:
                    previewWidget.videoEl.setInPoint();
                    that.inPointWidget.value = doubleSliderWidget.value.startMarkerFrame;
                    that.graph?.setDirtyCanvas(true);
                    break;
                case PlayerControls.gotoInPoint:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoInPoint();
                    break;
                case PlayerControls.stepBackward:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.regressOneFrame();
                    break;
                case PlayerControls.playPause:
                    updatePlayPauseControl(previewWidget, playerControlsWidget);
                    if (!isVideoPlaying(previewWidget)) {
                        previewWidget.videoEl.play();
                    } else {
                        previewWidget.videoEl.pause();
                    }
                    break;
                case PlayerControls.stepForward:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.advanceOneFrame();
                    break;
                case PlayerControls.gotoOutPoint:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoOutPoint();
                    break;
                case PlayerControls.setOutPoint:
                    previewWidget.videoEl.setOutPoint();
                    that.outPointWidget.value = doubleSliderWidget.value.endMarkerFrame;
                    that.graph?.setDirtyCanvas(true);
                    break;
                case PlayerControls.gotoEnd:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoEnd();
                    break;
            }                
        });
        this.playerControlsWidget = playerControlsWidget;

        // Add In/Out point and frame widgets
        const currentFrameWidget = this.addWidget("number", "current_frame", -1, (value) => {
            previewWidget.videoEl.setCurrentFrame(value);
        }, { min: 1, max: 1, step: 10, precision: 0 });
        this.currentFrameWidget = currentFrameWidget;

        const inPointWidget = this.addWidget("number", "in_point", -1, (value) => {
            previewWidget.videoEl.setInPoint(value);
        }, { min: 1, max: 1, step: 10, precision: 0 });
        this.inPointWidget = inPointWidget;

        const outPointWidget = this.addWidget("number", "out_point", -1, (value) => {
            previewWidget.videoEl.setOutPoint(value);
        }, { min: 1, max: 1, step: 10, precision: 0 });
        this.outPointWidget = outPointWidget;

        // Select every nth frame
        const selectEveryNthFrameWidget = this.addWidget("number", "select_every_nth_frame", 1, (value) => {}, { min: 1, step: 10, precision: 0 });
        this.selectEveryNthFrameWidget = selectEveryNthFrameWidget;

        // Make sure to reload video after refreshing
        setTimeout(() => {
            pathWidget.callback(pathWidget.value, true);
            this.graph?.setDirtyCanvas(true);
        }, 10);

        // Cleanup
        this.serialize_widgets = true;

        const originalOnRemoved = this.onRemoved;
        this.onRemoved = function () {
            originalOnRemoved?.apply(this, arguments);
            doubleSliderWidget.inputEl.remove();
        };
        this.setSize(this.computeSize());
    };

    // Loading serialized data
    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
        originalOnConfigure?.apply(this, arguments);

        const sizeWidget = this.widgets.find((w) => w.name === 'force_size');
        const customWidthWidget = this.widgets.find((w) => w.name === 'custom_width');
        const customHeightWidget = this.widgets.find((w) => w.name === 'custom_height');
        if (sizeWidget !== undefined) {
            updateCustomSizeLogic(sizeWidget, customWidthWidget, customHeightWidget);
            lnl_fitHeight(this);
        }
    };
}

/*
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):
*/
function lnl_fitHeight(node) {
    node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]])
    node?.graph?.setDirtyCanvas(true);
}
