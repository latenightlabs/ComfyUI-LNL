'use strict';

import { app } from "../../../scripts/app.js"; // For LiteGraph
import { api } from "../../../scripts/api.js";
import { $el } from "../../../scripts/ui.js";
import { createSpinner } from "../../../scripts/ui/spinner.js";

import { clamp, lnlGetUrl } from "./utils.js";
import { getBastePositionStyle } from "./styles.js";
import { handleBasteMouseEvent } from "./eventHandlers.js";
import { processVideoEntry } from "./utils.js";

// Double slider widget
function createDoubleSliderWidget(widgetName) {
    const doubleSliderWidget = {
        type: "double_slider",
        name: widgetName,
        options: { min: 0, max: 100, step: 1, precision: 1, read_only: false },
        value: { current: 0 , startMarkerFrame: 0, endMarkerFrame: 100, currentFrame: 1, totalFrames: 1 },
        marker: true,
        draw(ctx, node, widget_width, y, widget_height) { 
            Object.assign(this.inputEl.style, getBastePositionStyle(ctx, widget_width, y, node, widget_height));
        },
        onWidgetChanged(widget_name, new_value, old_value, widget) {
            console.log(`Widget ${widget_name} changed from ${old_value} to ${new_value}`);
        },
        mouse(event, pos, node) {
            return handleBasteMouseEvent(event, pos, node, this.positionUpdatedCallback);
        },
    };
    doubleSliderWidget.inputEl = $el("doubleSliderWidget", { src: null });
    
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

    const images = [
        lnlGetUrl("images/goto_start.png", import.meta.url),
        lnlGetUrl("images/set_in_point.png", import.meta.url),
        lnlGetUrl("images/goto_in_point.png", import.meta.url),
        lnlGetUrl("images/step_backward.png", import.meta.url),
        lnlGetUrl("images/pause.png", import.meta.url),
        lnlGetUrl("images/step_forward.png", import.meta.url),
        lnlGetUrl("images/goto_out_point.png", import.meta.url),
        lnlGetUrl("images/set_out_point.png", import.meta.url),
        lnlGetUrl("images/goto_end.png", import.meta.url),
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

// Video player widget helpers
function createLoaderOverlay(previewWidget) {
    previewWidget.playPauseOverlayEl = document.createElement("div");
    previewWidget.playPauseOverlayEl.style['position'] = "absolute";
    previewWidget.playPauseOverlayEl.style['display'] = "block";
    previewWidget.playPauseOverlayEl.style['top'] = "0px";
    previewWidget.playPauseOverlayEl.style['bottom'] = "4px";
    previewWidget.playPauseOverlayEl.style['left'] = "0px";
    previewWidget.playPauseOverlayEl.style['z-index'] = "100";
    previewWidget.playPauseOverlayEl.style['width'] = "100%";
    previewWidget.playPauseOverlayEl.style['background'] = "rgba(0, 0, 0, 0.0)";
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
    previewWidget.loaderEl.style['position'] = "absolute";
    previewWidget.loaderEl.style['display'] = "block";
    previewWidget.loaderEl.style['top'] = "0px";
    previewWidget.loaderEl.style['bottom'] = "4px";
    previewWidget.loaderEl.style['left'] = "0px";
    previewWidget.loaderEl.style['z-index'] = "9999";
    previewWidget.loaderEl.style['width'] = "100%";
    previewWidget.loaderEl.style['background'] = "rgba(0, 0, 0.0, 0.85)";
    previewWidget.loaderEl.style['visibility'] = "hidden";
    previewWidget.parentEl.appendChild(previewWidget.loaderEl);

    previewWidget.spinnerEl = document.createElement("div");
    previewWidget.spinnerEl.style['position'] = "relative";
    previewWidget.spinnerEl.style['text-align'] = "center";
    previewWidget.spinnerEl.style['top'] = "50%";
    previewWidget.spinnerEl.style['transform'] = "translateY(-50%)";
    previewWidget.spinnerEl.style['font-family'] = "Tahoma, sans-serif";
    previewWidget.spinnerEl.style['font-size'] = "120%";
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
    let imageHTML = "";
    if (!isVideoPlaying(previewWidget)) {
        imageHTML = `<img class="player-grid-item" src="${lnlGetUrl("images/pause.png", import.meta.url)}" />`;

    } else {
        imageHTML = `<img class="player-grid-item" src="${lnlGetUrl("images/play.png", import.meta.url)}" />`;
    }
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

// Create widgets
export async function createWidgets(nodeType) {
    const originalNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        originalNodeCreated?.apply(this, arguments);

        const that = this;

        // Create double slider widget
        const doubleSliderWidget = createDoubleSliderWidget("in_out_point_slider");
        updateSliderValues(doubleSliderWidget, this, 1, 1);

        // Add path widget
        const pathWidget = this.addWidget("text", "video_path", "videoPath/here.mp4", (value) => {
            let extension_index = value.lastIndexOf(".");
            let extension = value.slice(extension_index+1);
            let format = "video"
            format += "/" + extension;
            let params = {filename : value, type: "input", format: format};
            this.updateParameters(params);
        });
        this.pathWidget = pathWidget;

        // Add video preview widget
        const infiniteAR = 1000;
        var element = document.createElement("div");
        var previewWidget = this.addDOMWidget("video_preview_widget", "preview", element, {
            serialize: false,
            hideOnZoom: false,
            getValue() {
                return element.value;
            },
            setValue(v) {
                element.value = v;
            },
        });
        this.previewWidget = previewWidget;

        previewWidget.computeSize = function (width) {
            if (this.aspectRatio && !this.parentEl.hidden) {
                let height = (that.size[0] - 20) / this.aspectRatio + 10;
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
                    
                    previewWidget.value.params.frameDuration = jsonData.frame_duration;
                    previewWidget.value.params.totalFrames = jsonData.total_frames;
                    
                    doubleSliderWidget.value.startMarkerFrame = 1;
                    doubleSliderWidget.value.endMarkerFrame = jsonData.total_frames;
                    doubleSliderWidget.value.frameRate = jsonData.frame_rate;
                    
                    that.inPointWidget.value = 1;
                    that.outPointWidget.value = jsonData.total_frames;

                    updateSliderValues(doubleSliderWidget, that, 1, jsonData.total_frames);

                    let lastTime = 0;
                    previewWidget.videoEl.addEventListener('playing', (event) => {
                        function checkFrame() {
                            if (previewWidget.videoEl.currentTime !== lastTime) {
                                lastTime = previewWidget.videoEl.currentTime;
                                
                                const currentTime = previewWidget.videoEl.currentTime;
                                const currentFrame = Math.round(currentTime / jsonData.frame_duration);
                                that.currentFrameWidget.value = currentFrame;
                                updateSliderValues(doubleSliderWidget, that, currentFrame, jsonData.total_frames);
                            }
                            requestAnimationFrame(checkFrame);
                        }
                        checkFrame();

                        doubleSliderWidget.pointerIsDown = false;
                    });
                    previewWidget.videoEl.play();
                }
            }
            fitHeight(this);
        });
        
        previewWidget.videoEl.addEventListener("error", () => {
            previewWidget.aspectRatio = infiniteAR;
            previewWidget.loaderEl.style['visibility'] = "hidden";

            setTimeout(() => {
                previewWidget.value.params.frameDuration = 1;
                previewWidget.value.params.totalFrames = 1;

                that.inPointWidget.value = 1;
                that.outPointWidget.value = 1;

                doubleSliderWidget.value.startMarkerFrame = 1;
                doubleSliderWidget.value.endMarkerFrame = 1;
                doubleSliderWidget.value.frameRate = 1;

                this.currentTime = 1;

                updateSliderValues(doubleSliderWidget, that, 1, 1);
                fitHeight(this);
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

        // Move to previewWidget
        this.updateParameters = (params) => {
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
            const inFrame = doubleSliderWidget.value.startMarkerFrame;
            return inFrame;
        };
        previewWidget.videoEl.getOutPointFrame = function () {
            const outFrame = doubleSliderWidget.value.endMarkerFrame;
            return outFrame;
        };
        previewWidget.videoEl.getEndFrame = function () {
            const endFrame = previewWidget.value.params.totalFrames;
            return endFrame;
        };
        previewWidget.videoEl.setCurrentFrame = function (frame) {
            const clampedFrame = clamp(frame, 1, doubleSliderWidget.value.totalFrames);
            this.currentTime = clampedFrame * previewWidget.value.params.frameDuration;
            that.currentFrameWidget.value = clampedFrame;
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
            doubleSliderWidget.value.startMarkerFrame = valueToSet;
            that.inPointWidget.value = valueToSet;

            const outPointFrame = this.getOutPointFrame();
            if (valueToSet > outPointFrame) {
                doubleSliderWidget.value.endMarkerFrame = this.getEndFrame();
                that.outPointWidget.value = this.getEndFrame();
            }
        };
        previewWidget.videoEl.setOutPoint = function (value) {
            const currentFrame = this.getCurrentFrame();
            const valueToSet = value ? value : currentFrame;
            doubleSliderWidget.value.endMarkerFrame = valueToSet;
            that.outPointWidget.value = valueToSet;

            const inPointFrame = this.getInPointFrame();
            if (valueToSet < inPointFrame) {
                doubleSliderWidget.value.startMarkerFrame = this.getStartFrame();
                that.inPointWidget.value = this.getStartFrame();
            }
        };

        // Add loader widget
        createLoaderOverlay(previewWidget);

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
        previewWidget.playPauseTriggeredCallback = () => {
            updatePlayPauseControl(previewWidget, playerControlsWidget)
        };

        doubleSliderWidget.positionUpdatedCallback = (value) => {
            pauseVideoIfPlaying(previewWidget, playerControlsWidget);
            const frameAtValue = previewWidget.videoEl.getFrameForNValue(value);
            const clampedValue = clamp(frameAtValue, 1, doubleSliderWidget.value.totalFrames);
            previewWidget.videoEl.setCurrentFrame(clampedValue);
        };

        // Add In/Out point and frame widgets
        const currentFrameWidget = this.addWidget("text", "current_frame", 1, (value) => {
            const clampedValue = clamp(value, 1, doubleSliderWidget.value.totalFrames);
            setTimeout(() => {
                pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                currentFrameWidget.value = clampedValue;
                previewWidget.videoEl.setCurrentFrame(clampedValue);
            }, 10);
        });
        this.currentFrameWidget = currentFrameWidget;

        const inPointWidget = this.addWidget("text", "in_point", 1, (value) => {
            const clampedValue = clamp(value, 1, doubleSliderWidget.value.totalFrames);
            setTimeout(() => {
                inPointWidget.value = clampedValue;
                previewWidget.videoEl.setInPoint(clampedValue);
            }, 10);
        });
        this.inPointWidget = inPointWidget;

        const outPointWidget = this.addWidget("text", "out_point", 1, (value) => {
            const clampedValue = clamp(value, 1, doubleSliderWidget.value.totalFrames);
            setTimeout(() => {
                outPointWidget.value = clampedValue;
                previewWidget.videoEl.setOutPoint(clampedValue);
            }, 10);
        });
        this.outPointWidget = outPointWidget;

        // Select every nth frame
        const selectEveryNthFrameWidget = this.addWidget("number", "select_every_nth_frame", 1, (value) => {
            const clampedValue = clamp(value, 1, doubleSliderWidget.value.totalFrames);
            setTimeout(() => {
                selectEveryNthFrameWidget.value = clampedValue;
            }, 10);
        }, { min: 1, step: 10, precision: 0 });

        // Make sure to reload video after refreshing
        setTimeout(() => previewWidget.updateSource(), 10);

        // Cleanup
        this.serialize_widgets = true;

        const originalOnRemoved = this.onRemoved;
        this.onRemoved = function () {
            originalOnRemoved?.apply(this, arguments);
            doubleSliderWidget.inputEl.remove();
        };
        this.setSize(this.computeSize());
    };
}

function fitHeight(node) {
    node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]])
    node?.graph?.setDirtyCanvas(true);
}
