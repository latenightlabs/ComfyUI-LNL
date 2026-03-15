'use strict';

import { app } from "../../../scripts/app.js"; // For LiteGraph
import { api } from "../../../scripts/api.js";
import { createLNLSpinner } from "../OldSpinner/spinner.js";

import { clamp, lnlGetUrl, lnlUploadFile } from "../utils.js";
import { getLNLPositionStyle } from "../styles.js";
import { handleLNLMouseEvent } from "../eventHandlers.js";
import { processVideoEntry } from "../utils.js";

// Double slider widget
function createDoubleSliderWidget(hostNode, widgetName) {
    const doubleSliderWidget = {
        type: "double_slider",
        name: widgetName,
        serialize: true,
        options: { min: 0, max: 100, step: 1, precision: 1, read_only: false },
        value: { current: 0 , startMarkerFrame: 0, endMarkerFrame: 100, currentFrame: 1, totalFrames: 1 },
        marker: true,
        width_margin: 10,
        draw(ctx, node, widget_width, y, widget_height) { 
            if (!this.inputEl || !this.inputEl.style) {
                return;
            }
            Object.assign(this.inputEl.style, getLNLPositionStyle(ctx, widget_width, y, node, widget_height));
        },
        onWidgetChanged(widget_name, new_value, old_value, widget) {},
        mouse(event, pos, node) {
            return handleLNLMouseEvent(event, pos, node, this.positionUpdatedCallback);
        },
    };
    doubleSliderWidget.inputEl = document.createElement("div");
    doubleSliderWidget.inputEl.style.pointerEvents = "auto";
    doubleSliderWidget.inputEl.style.touchAction = "none";
    doubleSliderWidget.inputEl.style.cursor = "pointer";
    doubleSliderWidget.inputEl.style.background = "transparent";
    doubleSliderWidget.dragging = false;
    const updateFromPointer = (event) => {
        const rect = doubleSliderWidget.inputEl.getBoundingClientRect();
        if (!rect.width) {
            return;
        }
        const x = clamp(event.clientX - rect.left, 0, rect.width);
        const nvalue = x / rect.width;
        const value = doubleSliderWidget.options.min
            + (doubleSliderWidget.options.max - doubleSliderWidget.options.min) * nvalue;
        const sliderWidget = getPrimaryDoubleSliderWidget(hostNode) ?? doubleSliderWidget;
        const existingValue = sliderWidget.value && typeof sliderWidget.value === "object" ? sliderWidget.value : {};
        sliderWidget.value = {
            ...existingValue,
            current: value,
        };
        if (sliderWidget.positionUpdatedCallback) {
            sliderWidget.positionUpdatedCallback(value);
        } else if (doubleSliderWidget.positionUpdatedCallback) {
            doubleSliderWidget.positionUpdatedCallback(value);
        }
    };
    doubleSliderWidget.inputEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        hostNode._lnlScrubActive = true;
        doubleSliderWidget.pointerIsDown = true;
        const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
        if (sliderWidget) {
            sliderWidget.pointerIsDown = true;
        }
        doubleSliderWidget.dragging = true;
        doubleSliderWidget.inputEl.setPointerCapture(event.pointerId);
        updateFromPointer(event);
    });
    doubleSliderWidget.inputEl.addEventListener("pointermove", (event) => {
        if (!doubleSliderWidget.dragging) {
            return;
        }
        event.preventDefault();
        updateFromPointer(event);
    });
    doubleSliderWidget.inputEl.addEventListener("pointerup", (event) => {
        if (!doubleSliderWidget.dragging) {
            return;
        }
        event.preventDefault();
        doubleSliderWidget.dragging = false;
        hostNode._lnlScrubActive = false;
        doubleSliderWidget.pointerIsDown = false;
        const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
        if (sliderWidget) {
            sliderWidget.pointerIsDown = false;
        }
        try {
            doubleSliderWidget.inputEl.releasePointerCapture(event.pointerId);
        } catch {
            // no-op: capture might already be released
        }
        updateFromPointer(event);
    });
    doubleSliderWidget.inputEl.addEventListener("pointercancel", (event) => {
        doubleSliderWidget.dragging = false;
        hostNode._lnlScrubActive = false;
        doubleSliderWidget.pointerIsDown = false;
        const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
        if (sliderWidget) {
            sliderWidget.pointerIsDown = false;
        }
        try {
            doubleSliderWidget.inputEl.releasePointerCapture(event.pointerId);
        } catch {
            // no-op
        }
    });
    doubleSliderWidget.positionUpdatedCallback = (value) => {
        pauseVideoIfPlaying(hostNode.previewWidget, hostNode.playerControlsWidget);
        const frameAtValue = hostNode.previewWidget.videoEl.getFrameForNValue(value);
        const sliderWidget = getPrimaryDoubleSliderWidget(hostNode) ?? doubleSliderWidget;
        const totalFrames = Math.max(1, sliderWidget?.value?.totalFrames ?? 1);
        const clampedValue = clamp(frameAtValue, 1, totalFrames);
        applyFrameState(hostNode, { currentFrame: clampedValue }, { source: "currentFrame", updateVideo: true });
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
        return [width, Math.round(LiteGraph.NODE_WIDGET_HEIGHT * 3)];
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

function createPauseControlsWidget(hostNode) {
    const element = document.createElement("div");
    element.className = "lnl-pause-controls";
    element.style.display = "none";

    const messageEl = document.createElement("div");
    messageEl.className = "lnl-pause-message";
    messageEl.textContent = "Workflow paused. Adjust trim then continue.";
    element.appendChild(messageEl);

    const buttonsEl = document.createElement("div");
    buttonsEl.className = "lnl-pause-buttons";
    element.appendChild(buttonsEl);

    const continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.className = "lnl-pause-continue";
    continueBtn.textContent = "Continue";
    buttonsEl.appendChild(continueBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "lnl-pause-cancel";
    cancelBtn.textContent = "Cancel";
    buttonsEl.appendChild(cancelBtn);

    const pauseWidget = hostNode.addDOMWidget("pause_controls", "lnl_pause_controls", element, {
        serialize: false,
        hideOnZoom: false,
    });
    pauseWidget.computeSize = function (width) {
        return [width, Math.round(LiteGraph.NODE_WIDGET_HEIGHT * 1.8)];
    };
    pauseWidget.messageEl = messageEl;
    pauseWidget.element = element;
    pauseWidget.setVisible = function (visible) {
        element.style.display = visible ? "flex" : "none";
        lnl_fitHeight(hostNode);
    };
    pauseWidget.setCountdown = function (seconds) {
        if (typeof seconds === "number" && seconds >= 0) {
            messageEl.textContent = `Workflow paused. Time remaining: ${seconds}s`;
        }
    };
    pauseWidget.resetMessage = function () {
        messageEl.textContent = "Workflow paused. Adjust trim then continue.";
    };

    continueBtn.addEventListener("click", async () => {
        pauseWidget.setVisible(false);
        hostNode._lnlPauseActive = false;
        setWaitingForOtherPause(hostNode, false);
        await sendPauseResponse(hostNode, { special: null });
    });
    cancelBtn.addEventListener("click", async () => {
        pauseWidget.setVisible(false);
        hostNode._lnlPauseActive = false;
        setWaitingForOtherPause(hostNode, false);
        await sendPauseResponse(hostNode, { special: "-3" });
    });

    return pauseWidget;
}

function createTimelineWidget(hostNode) {
    const element = document.createElement("div");
    element.className = "lnl-timeline";
    element.style.marginBottom = "0";

    const trackEl = document.createElement("div");
    trackEl.className = "lnl-timeline-track";

    const preFillEl = document.createElement("div");
    preFillEl.className = "lnl-timeline-pre";
    trackEl.appendChild(preFillEl);

    const fillEl = document.createElement("div");
    fillEl.className = "lnl-timeline-fill";
    trackEl.appendChild(fillEl);

    const postFillEl = document.createElement("div");
    postFillEl.className = "lnl-timeline-post";
    trackEl.appendChild(postFillEl);

    const inMarkerEl = document.createElement("div");
    inMarkerEl.className = "lnl-timeline-marker lnl-timeline-marker-in";
    trackEl.appendChild(inMarkerEl);

    const outMarkerEl = document.createElement("div");
    outMarkerEl.className = "lnl-timeline-marker lnl-timeline-marker-out";
    trackEl.appendChild(outMarkerEl);

    const currentMarkerEl = document.createElement("div");
    currentMarkerEl.className = "lnl-timeline-marker lnl-timeline-marker-current";
    trackEl.appendChild(currentMarkerEl);

    const labelEl = document.createElement("div");
    labelEl.className = "lnl-timeline-label";
    trackEl.appendChild(labelEl);

    element.appendChild(trackEl);

    const timelineWidget = hostNode.addDOMWidget("timeline_widget", "lnl_timeline_widget", element, {
        serialize: false,
        hideOnZoom: false,
    });
    timelineWidget.computeSize = function (width) {
        return [width, LiteGraph.NODE_WIDGET_HEIGHT];
    };
    timelineWidget.elements = {
        trackEl,
        preFillEl,
        fillEl,
        postFillEl,
        inMarkerEl,
        outMarkerEl,
        currentMarkerEl,
        labelEl,
    };
    timelineWidget.update = function (state) {
        const totalFrames = Math.max(1, state.totalFrames || 1);
        const currentFrame = clamp(state.currentFrame || 1, 1, totalFrames);
        const inPoint = clamp(state.inPoint || 1, 1, totalFrames);
        const outPoint = clamp(state.outPoint || totalFrames, 1, totalFrames);

        const inPct = (inPoint / totalFrames) * 100;
        const outPct = (outPoint / totalFrames) * 100;
        const currentPct = (currentFrame / totalFrames) * 100;

        preFillEl.style.width = `${inPct}%`;

        const fillStart = inPct;
        const fillEnd = clamp(currentPct, inPct, outPct);
        fillEl.style.left = `${fillStart}%`;
        fillEl.style.width = `${Math.max(0, fillEnd - fillStart)}%`;

        postFillEl.style.left = `${outPct}%`;
        postFillEl.style.width = `${Math.max(0, 100 - outPct)}%`;

        inMarkerEl.style.left = `${inPct}%`;
        outMarkerEl.style.left = `${outPct}%`;
        currentMarkerEl.style.left = `${currentPct}%`;

        labelEl.textContent = `Frame: ${currentFrame} / ${totalFrames}`;
    };

    const updateFromPointer = (event) => {
        const rect = trackEl.getBoundingClientRect();
        if (!rect.width) {
            return;
        }
        const x = clamp(event.clientX - rect.left, 0, rect.width);
        const nvalue = (x / rect.width) * 100;
        if (!hostNode.previewWidget?.videoEl) {
            return;
        }
        pauseVideoIfPlaying(hostNode.previewWidget, hostNode.playerControlsWidget);
        const frameAtValue = hostNode.previewWidget.videoEl.getFrameForNValue(nvalue);
        const totalFrames = getTotalFramesFromNode(hostNode);
        const clampedValue = clamp(frameAtValue, 1, totalFrames);
        applyFrameState(hostNode, { currentFrame: clampedValue }, { source: "currentFrame", updateVideo: true });
    };

    trackEl.style.cursor = "pointer";
    trackEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        hostNode._lnlScrubActive = true;
        timelineWidget.dragging = true;
        trackEl.setPointerCapture(event.pointerId);
        updateFromPointer(event);
    });
    trackEl.addEventListener("pointermove", (event) => {
        if (!timelineWidget.dragging) {
            return;
        }
        event.preventDefault();
        updateFromPointer(event);
    });
    trackEl.addEventListener("pointerup", (event) => {
        if (!timelineWidget.dragging) {
            return;
        }
        event.preventDefault();
        timelineWidget.dragging = false;
        hostNode._lnlScrubActive = false;
        try {
            trackEl.releasePointerCapture(event.pointerId);
        } catch {
            // no-op
        }
        updateFromPointer(event);
    });
    trackEl.addEventListener("pointercancel", (event) => {
        timelineWidget.dragging = false;
        hostNode._lnlScrubActive = false;
        try {
            trackEl.releasePointerCapture(event.pointerId);
        } catch {
            // no-op
        }
    });

    return timelineWidget;
}

function createAudioEnvelopeWidget(hostNode) {
    const envelopeOverlap = 6;
    const envelopeHeight = 18 + envelopeOverlap;
    const element = document.createElement("div");
    element.className = "lnl-audio-envelope";
    element.style.cursor = "pointer";
    element.style.marginTop = `-${envelopeOverlap}px`;
    element.style.marginBottom = "0";
    element.style.height = `${envelopeHeight}px`;
    element.style.minHeight = `${envelopeHeight}px`;

    const canvas = document.createElement("canvas");
    canvas.className = "lnl-audio-envelope-canvas";
    element.appendChild(canvas);

    const silentEl = document.createElement("div");
    silentEl.className = "lnl-audio-silence";
    silentEl.textContent = "silence";
    silentEl.style.display = "none";
    element.appendChild(silentEl);

    const widget = hostNode.addDOMWidget("audio_envelope_widget", "lnl_audio_envelope", element, {
        serialize: false,
        hideOnZoom: false,
    });
    widget.computeSize = function (width) {
        return [width, envelopeHeight];
    };
    widget.envelope = null;
    widget.totalFrames = 1;
    widget.currentFrame = 1;
    widget.noAudio = false;

    const updateFromPointer = (event) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width) {
            return;
        }
        const x = clamp(event.clientX - rect.left, 0, rect.width);
        const nvalue = x / rect.width;
        if (!hostNode.previewWidget?.videoEl) {
            return;
        }
        pauseVideoIfPlaying(hostNode.previewWidget, hostNode.playerControlsWidget);
        const totalFrames = getTotalFramesFromNode(hostNode);
        const targetFrame = Math.round(nvalue * (totalFrames - 1)) + 1;
        const clampedFrame = clamp(targetFrame, 1, totalFrames);
        hostNode._lnlScrubActive = true;
        hostNode.previewWidget.videoEl.setCurrentFrame(clampedFrame);
    };

    element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        widget.dragging = true;
        element.setPointerCapture(event.pointerId);
        updateFromPointer(event);
    });
    element.addEventListener("pointermove", (event) => {
        if (!widget.dragging) {
            return;
        }
        event.preventDefault();
        updateFromPointer(event);
    });
    element.addEventListener("pointerup", (event) => {
        if (!widget.dragging) {
            return;
        }
        event.preventDefault();
        widget.dragging = false;
        hostNode._lnlScrubActive = false;
        try {
            element.releasePointerCapture(event.pointerId);
        } catch {
            // no-op
        }
        updateFromPointer(event);
    });
    element.addEventListener("pointercancel", () => {
        widget.dragging = false;
        hostNode._lnlScrubActive = false;
    });

    const draw = () => {
        const values = widget.envelope?.values;
        if (!values || !values.length) {
            widget.noAudio = true;
        }
        element.style.display = "";
        const width = element.clientWidth || 1;
        const height = element.clientHeight || 1;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        ctx.clearRect(0, 0, width, height);
        if (widget.noAudio) {
            ctx.fillStyle = "rgba(30, 32, 36, 0.65)";
            ctx.fillRect(0, 0, width, height);
            silentEl.textContent = "no audio";
            silentEl.style.display = "block";
            return;
        }
        const maxVal = widget.envelope?.max || 1e-6;
        const threshold = maxVal * 0.05;
        const binCount = values.length;
        const step = width / binCount;
        for (let i = 0; i < binCount; i += 1) {
            const value = values[i];
            const ratio = Math.min(1, value / maxVal);
            const barHeight = Math.max(1, ratio * (height - 2));
            const x = i * step;
            ctx.fillStyle = value < threshold ? "rgba(170, 176, 186, 0.6)" : "rgba(180, 120, 120, 0.9)";
            ctx.fillRect(x, height - barHeight, Math.max(1, step * 0.9), barHeight);
        }
        if (widget.totalFrames > 1) {
            const idx = Math.round((widget.currentFrame - 1) / (widget.totalFrames - 1) * (binCount - 1));
            const currentVal = values[idx] ?? 0;
            const x = idx * step + step * 0.5;
            ctx.strokeStyle = "rgba(240, 240, 240, 0.8)";
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            silentEl.textContent = "silence";
            silentEl.style.display = currentVal < threshold ? "block" : "none";
        } else {
            silentEl.style.display = "none";
        }
    };

    widget.setEnvelope = (envelope, totalFrames) => {
        widget.envelope = envelope;
        widget.noAudio = !envelope || !envelope.values?.length;
        widget.totalFrames = totalFrames || widget.totalFrames;
        draw();
    };
    widget.updateCurrentFrame = (frame) => {
        widget.currentFrame = frame || widget.currentFrame;
        draw();
    };
    widget.clear = () => {
        widget.envelope = null;
        widget.noAudio = true;
        silentEl.textContent = "no audio";
        silentEl.style.display = "block";
        element.style.display = "";
    };
    widget.redraw = draw;
    widget.noAudio = true;
    setTimeout(draw, 0);
    return widget;
}

function buildSequenceFrameUrl(sequence, frameIndex) {
    if (!sequence) {
        return "";
    }
    const pad = sequence.pad ?? 5;
    const filename = `${sequence.prefix}_${String(frameIndex).padStart(pad, "0")}.${sequence.ext ?? "png"}`;
    const params = new URLSearchParams({
        filename,
        subfolder: sequence.subfolder ?? "",
        type: sequence.type ?? "temp",
    });
    return api.apiURL(`/view?${params}`);
}

function buildAudioPreviewUrl(preview) {
    if (!preview) {
        return "";
    }
    const params = new URLSearchParams({
        filename: preview.filename,
        subfolder: preview.subfolder ?? "",
        type: preview.type ?? "temp",
    });
    return api.apiURL(`/view?${params}`);
}

function createImageSequencePlayer(previewWidget, hostNode) {
    const listeners = {};
    const player = {
        paused: true,
        ended: false,
        currentFrame: 1,
        frameRate: 30,
        frameDuration: 1 / 30,
        totalFrames: 1,
        addEventListener(event, handler) {
            if (!listeners[event]) {
                listeners[event] = new Set();
            }
            listeners[event].add(handler);
        },
        removeEventListener(event, handler) {
            listeners[event]?.delete(handler);
        },
        _emit(event) {
            for (const handler of listeners[event] ?? []) {
                handler();
            }
        },
        _setCurrentFrame(frame, options = {}) {
            const totalFrames = getTotalFramesFromNode(hostNode) || this.totalFrames || 1;
            const clampedFrame = clamp(frame, 1, totalFrames);
            this.currentFrame = clampedFrame;
            this.currentTime = (clampedFrame - 1) * this.frameDuration;
            previewWidget.renderSequenceFrame?.(clampedFrame);
            if (!options.skipAudio) {
                previewWidget.syncAudioToFrame?.(clampedFrame, { scrub: hostNode._lnlScrubActive });
            }
            if (!options.silent) {
                applyFrameState(hostNode, { currentFrame: clampedFrame }, { source: "currentFrame" });
            }
        },
        setSequence(sequence) {
            this.totalFrames = Math.max(1, sequence?.count ?? 1);
            this.frameRate = sequence?.frame_rate ?? previewWidget.value?.params?.frameRate ?? 30;
            this.frameDuration = this.frameRate ? 1 / this.frameRate : 0;
            this.currentFrame = 1;
            this.ended = false;
            this.paused = true;
            previewWidget.renderSequenceFrame?.(this.currentFrame);
        },
        play() {
            if (!this.paused) {
                return;
            }
            this.paused = false;
            this.ended = false;
            this._emit("playing");
            previewWidget.playAudioFromFrame?.(this.currentFrame);
            const tick = () => {
                if (this.paused) {
                    return;
                }
                // Playback should cover the full media; in/out points are used for trim/export.
                const nextFrame = Math.min(this.currentFrame + 1, this.getEndFrame());
                if (nextFrame <= this.currentFrame) {
                    this.ended = true;
                    this.pause();
                    this._emit("ended");
                    return;
                }
                this._setCurrentFrame(nextFrame, { silent: true });
                applyFrameState(hostNode, { currentFrame: nextFrame }, { source: "currentFrame", updateVideo: false });
                this._timer = setTimeout(tick, Math.max(1, this.frameDuration * 1000));
            };
            this._timer = setTimeout(tick, Math.max(1, this.frameDuration * 1000));
        },
        pause() {
            if (this._timer) {
                clearTimeout(this._timer);
                this._timer = null;
            }
            if (!this.paused) {
                this.paused = true;
                this._emit("pause");
                previewWidget.stopAudio?.();
            }
        },
        getFrameForNValue(nvalue) {
            const frameAtValue = parseInt(nvalue * (this.totalFrames || 1) / 100);
            return Math.max(1, frameAtValue);
        },
        getCurrentFrame() {
            return this.currentFrame;
        },
        getStartFrame() {
            return 1;
        },
        getInPointFrame() {
            const state = hostNode?._lnlFrameState;
            if (state?.inPoint) {
                return state.inPoint;
            }
            const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
            return sliderWidget?.value?.startMarkerFrame ?? 1;
        },
        getOutPointFrame() {
            const state = hostNode?._lnlFrameState;
            if (state?.outPoint) {
                return state.outPoint;
            }
            const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
            return sliderWidget?.value?.endMarkerFrame ?? this.getEndFrame();
        },
        getEndFrame() {
            return this.totalFrames || 1;
        },
        setCurrentFrame(frame, options = {}) {
            this._setCurrentFrame(frame, options);
        },
        advanceOneFrame() {
            const endFrame = this.getEndFrame();
            const nextFrame = Math.min(this.getCurrentFrame() + 1, endFrame);
            this.setCurrentFrame(nextFrame);
        },
        regressOneFrame() {
            const startFrame = this.getStartFrame();
            const previousFrame = Math.max(this.getCurrentFrame() - 1, startFrame);
            this.setCurrentFrame(previousFrame);
        },
        gotoInPoint() {
            const inFrame = this.getInPointFrame();
            this.setCurrentFrame(inFrame);
        },
        gotoOutPoint() {
            const outFrame = this.getOutPointFrame();
            this.setCurrentFrame(outFrame);
        },
        gotoStart() {
            this.setCurrentFrame(this.getStartFrame());
        },
        gotoEnd() {
            this.setCurrentFrame(this.getEndFrame());
        },
        setInPoint(value) {
            const currentFrame = this.getCurrentFrame();
            const valueToSet = value ? value : currentFrame;
            applyFrameState(hostNode, { inPoint: valueToSet }, { source: "inPoint" });
        },
        setOutPoint(value) {
            const currentFrame = this.getCurrentFrame();
            const valueToSet = value ? value : currentFrame;
            applyFrameState(hostNode, { outPoint: valueToSet }, { source: "outPoint" });
        },
    };
    return player;
}

// Video preview widget
function createVideoPreviewWidget(hostNode) {
    const infiniteAR = 1000;
    const element = document.createElement("div");
    element.style.minHeight = "140px";
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
        const minHeight = 140;
        if (this.aspectRatio && !this.parentEl.hidden) {
            let height = (hostNode.size[0] - 20) / this.aspectRatio + 10;
            if (!(height > 0)) {
                height = minHeight;
            }
            height = Math.max(minHeight, height);
            this.computedHeight = height + 10;
            return [width, height];
        }
        this.computedHeight = minHeight + 10;
        return [width, minHeight];
    }
    previewWidget.aspectRatio = infiniteAR;
    previewWidget.value = { hidden: false, paused: false, params: {} }
    previewWidget._hostNode = hostNode;
    previewWidget.parentEl = document.createElement("div");
    previewWidget.parentEl.style['position'] = "relative";
    previewWidget.parentEl.style['width'] = "100%";
    previewWidget.parentEl.style['minHeight'] = "140px";
    element.appendChild(previewWidget.parentEl);
    previewWidget._videoEl = document.createElement("video");
    previewWidget._videoEl.controls = false;
    previewWidget._videoEl.loop = false;
    previewWidget._videoEl.muted = true;
    previewWidget._videoEl.style['width'] = "100%";
    previewWidget._videoEl.style['pointer-events'] = "none";
    previewWidget.videoEl = previewWidget._videoEl;

    previewWidget.imageEl = document.createElement("img");
    previewWidget.imageEl.style.width = "100%";
    previewWidget.imageEl.style.display = "none";
    previewWidget.imageEl.style.pointerEvents = "none";
    previewWidget.parentEl.appendChild(previewWidget.imageEl);
    previewWidget.parentEl.appendChild(previewWidget._videoEl);
    previewWidget.audioEl = document.createElement("audio");
    previewWidget.audioEl.preload = "auto";
    previewWidget.audioEl.crossOrigin = "anonymous";
    previewWidget.audioEl.style.display = "none";
    previewWidget.parentEl.appendChild(previewWidget.audioEl);
    previewWidget._audioSrc = null;
    previewWidget._audioScrubTimer = null;
    previewWidget._audioPending = null;
    previewWidget._audioBoundPlayer = null;
    previewWidget._audioListeners = null;

    previewWidget.clearAudioSource = () => {
        if (!previewWidget.audioEl) {
            return;
        }
        previewWidget.stopAudio?.();
        previewWidget.audioEl.removeAttribute("src");
        previewWidget.audioEl.load();
        previewWidget._audioSrc = null;
    };

    previewWidget.setAudioSource = (preview, options = {}) => {
        if (!previewWidget.audioEl) {
            return;
        }
        if (!preview) {
            previewWidget.clearAudioSource();
            return;
        }
        const url = buildAudioPreviewUrl(preview);
        if (!url || previewWidget._audioSrc === url) {
            return;
        }
        if (!options.keepVideoAudioMode) {
            previewWidget._useVideoAudio = false;
        }
        previewWidget._audioSrc = url;
        previewWidget.audioEl.src = url;
        previewWidget.audioEl.load();
    };

    previewWidget.setAudioSourceFromVideo = () => {
        if (!previewWidget.audioEl) {
            return;
        }
        const filename = previewWidget.value?.params?.filename;
        if (!filename) {
            previewWidget.clearAudioSource();
            return;
        }
        const params = new URLSearchParams({ filename });
        if (previewWidget.value?.params?.type) {
            params.set("type", previewWidget.value.params.type);
        }
        if (previewWidget.value?.params?.format) {
            params.set("format", previewWidget.value.params.format);
        }
        const url = api.apiURL(`/view?${params}`);
        if (previewWidget._audioSrc === url) {
            return;
        }
        previewWidget._useVideoAudio = true;
        previewWidget._audioSrc = url;
        previewWidget.audioEl.src = url;
        previewWidget.audioEl.load();
    };

    previewWidget.requestVideoAudioPreview = async () => {
        if (!previewWidget._useVideoAudio) {
            return;
        }
        const filename = previewWidget.value?.params?.filename;
        if (!filename) {
            return;
        }
        const requestId = (previewWidget._audioPreviewRequestId ?? 0) + 1;
        previewWidget._audioPreviewRequestId = requestId;
        try {
            const params = new URLSearchParams({ filename });
            const totalFrames = Number(previewWidget.value?.params?.totalFrames);
            if (Number.isFinite(totalFrames) && totalFrames > 0) {
                params.set("total_frames", `${Math.floor(totalFrames)}`);
            }
            const res = await api.fetchApi(`/lnl-frame-selector-audio-preview?${params.toString()}`);
            const json = await res.json();
            if (previewWidget._audioPreviewRequestId !== requestId) {
                return;
            }
            if (json?.preview) {
                previewWidget.setAudioSource(json.preview, { keepVideoAudioMode: true });
            }
            if (hostNode.audioEnvelopeWidget?.setEnvelope) {
                hostNode.audioEnvelopeWidget.setEnvelope(json?.envelope ?? null, totalFrames || 1);
            }
        } catch {
            // ignore preview errors
        }
    };

    previewWidget.getAudioTimeForFrame = (frame) => {
        const duration = previewWidget.value?.params?.duration ?? 0;
        const frameDuration = previewWidget.value?.params?.frameDuration ?? 0;
        if (frameDuration > 0) {
            return Math.max(0, (frame - 1) * frameDuration);
        }
        if (duration > 0 && previewWidget.value?.params?.totalFrames) {
            return Math.max(0, (frame - 1) * (duration / previewWidget.value.params.totalFrames));
        }
        return 0;
    };

    previewWidget.playAudioFromFrame = (frame, options = {}) => {
        const audioEl = previewWidget.audioEl;
        if (!audioEl || !previewWidget._audioSrc) {
            return;
        }
        const time = previewWidget.getAudioTimeForFrame(frame);
        const playMode = options.scrub ? "scrub" : "continuous";
        const applySeek = () => {
            try {
                audioEl.currentTime = time;
            } catch {
                // ignore seek errors until ready
            }
            audioEl.play().catch(() => {});
            if (playMode === "scrub") {
                if (previewWidget._audioScrubTimer) {
                    clearTimeout(previewWidget._audioScrubTimer);
                }
                previewWidget._audioScrubTimer = setTimeout(() => {
                    audioEl.pause();
                }, 120);
            }
        };
        if (audioEl.readyState >= 1) {
            applySeek();
        } else {
            previewWidget._audioPending = { time, scrub: options.scrub };
            audioEl.addEventListener("loadedmetadata", function onMeta() {
                audioEl.removeEventListener("loadedmetadata", onMeta);
                if (previewWidget._audioPending) {
                    const pending = previewWidget._audioPending;
                    previewWidget._audioPending = null;
                    previewWidget.playAudioFromFrame(frame, pending);
                }
            });
        }
    };

    previewWidget.syncAudioToFrame = (frame, options = {}) => {
        if (options?.skipAudio) {
            return;
        }
        if (isVideoPlaying(previewWidget)) {
            return;
        }
        previewWidget.playAudioFromFrame(frame, { scrub: !!options.scrub });
    };

    previewWidget.stopAudio = () => {
        const audioEl = previewWidget.audioEl;
        if (!audioEl) {
            return;
        }
        if (previewWidget._audioScrubTimer) {
            clearTimeout(previewWidget._audioScrubTimer);
            previewWidget._audioScrubTimer = null;
        }
        audioEl.pause();
    };

    previewWidget._bindAudioToPlayer = (player) => {
        if (!player || previewWidget._audioBoundPlayer === player) {
            return;
        }
        if (previewWidget._audioBoundPlayer && previewWidget._audioListeners) {
            const previous = previewWidget._audioBoundPlayer;
            const listeners = previewWidget._audioListeners;
            previous.removeEventListener?.("playing", listeners.playing);
            previous.removeEventListener?.("pause", listeners.pause);
            previous.removeEventListener?.("ended", listeners.ended);
        }
        const listeners = {
            playing: () => previewWidget.playAudioFromFrame?.(player.getCurrentFrame?.() ?? 1),
            pause: () => previewWidget.stopAudio?.(),
            ended: () => previewWidget.stopAudio?.(),
        };
        player.addEventListener?.("playing", listeners.playing);
        player.addEventListener?.("pause", listeners.pause);
        player.addEventListener?.("ended", listeners.ended);
        previewWidget._audioBoundPlayer = player;
        previewWidget._audioListeners = listeners;
    };
    previewWidget._lnlSequenceAspectReady = false;
    previewWidget.imageEl.addEventListener("load", () => {
        if (previewWidget.mode !== "image_sequence") {
            return;
        }
        if (previewWidget._lnlSequenceAspectReady) {
            return;
        }
        const width = previewWidget.imageEl.naturalWidth;
        const height = previewWidget.imageEl.naturalHeight;
        if (width > 0 && height > 0) {
            previewWidget.aspectRatio = width / height;
            previewWidget._lnlSequenceAspectReady = true;
            lnl_fitHeight(hostNode);
        }
    });

    previewWidget.sequencePlayer = createImageSequencePlayer(previewWidget, hostNode);
    previewWidget.sequence = null;
    previewWidget.mode = "video";
    previewWidget.renderSequenceFrame = (frame) => {
        if (!previewWidget.sequence) {
            return;
        }
        const frameIndex = clamp(frame, 1, previewWidget.sequence.count || 1);
        previewWidget.imageEl.src = buildSequenceFrameUrl(previewWidget.sequence, frameIndex);
    };
    previewWidget.useImageSequence = (sequence, stateOverrides = {}) => {
        if (!sequence) {
            return;
        }
        previewWidget.sequence = sequence;
        previewWidget.mode = "image_sequence";
        previewWidget._lnlSequenceAspectReady = false;
        previewWidget.imageEl.style.display = "";
        previewWidget._videoEl.style.display = "none";
        previewWidget.videoEl = previewWidget.sequencePlayer;
        previewWidget.sequencePlayer.setSequence(sequence);
        previewWidget._bindAudioToPlayer(previewWidget.sequencePlayer);
        const totalFrames = Math.max(1, sequence.count || 1);
        const frameRate = sequence.frame_rate ?? 30;
        previewWidget.value.params.frameDuration = frameRate ? 1 / frameRate : 0;
        previewWidget.value.params.duration = frameRate ? totalFrames / frameRate : 0;
        previewWidget.value.params.totalFrames = totalFrames;
        previewWidget.value.params.frameRate = frameRate;
        const currentFrame = stateOverrides.currentFrame ?? hostNode.currentFrameWidget?.value ?? 1;
        const inPoint = stateOverrides.inPoint ?? hostNode.inPointWidget?.value ?? 1;
        const outPoint = stateOverrides.outPoint ?? hostNode.outPointWidget?.value ?? totalFrames;
        applyFrameState(hostNode, {
            totalFrames,
            frameRate,
            currentFrame,
            inPoint,
            outPoint,
        }, { source: "init", updateVideo: true, force: true, skipAudio: true });
        if (previewWidget.loaderEl) {
            previewWidget.loaderEl.style['visibility'] = "hidden";
        }
    };
    previewWidget.useVideoSource = () => {
        if (previewWidget.mode !== "video") {
            previewWidget.mode = "video";
            previewWidget.videoEl = previewWidget._videoEl;
            previewWidget.imageEl.style.display = "none";
            previewWidget._videoEl.style.display = "";
        }
        previewWidget._bindAudioToPlayer(previewWidget._videoEl);
    };

    previewWidget._videoEl.addEventListener("loadedmetadata", async () => {
        previewWidget.aspectRatio = previewWidget.videoEl.videoWidth / previewWidget.videoEl.videoHeight;
        lnl_fitHeight(hostNode);
        previewWidget.loaderEl.style['visibility'] = "visible";

        let params = {}
        Object.assign(params, previewWidget.value.params);
                if (params.filename) {
                    const jsonData = await processVideoEntry(params.filename);
            if (jsonData) {
                previewWidget.loaderEl.style['visibility'] = "hidden";

                [hostNode.inPointWidget, hostNode.outPointWidget, hostNode.currentFrameWidget].forEach((widget) => {
                    widget.options.min = 1;
                    widget.options.max = jsonData.total_frames;    
                });

                const componentCreated = hostNode.componentCreated;
                const componentLoadedOrRefreshed = hostNode.currentFrameWidget.value != -1;
                previewWidget.value.params.frameDuration = jsonData.frame_duration;
                previewWidget.value.params.duration = jsonData.duration;
                previewWidget.value.params.totalFrames = jsonData.total_frames;
                const totalFrames = jsonData.total_frames;
                const isFreshState = !componentCreated || !componentLoadedOrRefreshed;
                const currentFrame = isFreshState ? 1 : hostNode.currentFrameWidget.value;
                const inPoint = isFreshState ? 1 : hostNode.inPointWidget.value;
                const outPoint = isFreshState ? totalFrames : hostNode.outPointWidget.value;
                applyFrameState(hostNode, {
                    totalFrames,
                    frameRate: jsonData.frame_rate,
                    currentFrame,
                    inPoint,
                    outPoint,
                }, { source: "init", updateVideo: true, skipAudio: true });
                setWidgetValue(hostNode, hostNode.selectEveryNthFrameWidget, 1);
                previewWidget.requestVideoAudioPreview?.();

                let lastTime = 0;
                const syncCurrentFrame = () => {
                    const totalFrames = getTotalFramesFromNode(hostNode);
                    if (!totalFrames) {
                        return;
                    }
                    const currentFrame = clamp(previewWidget.videoEl.getCurrentFrame(), 1, totalFrames);
                    applyFrameState(hostNode, { currentFrame }, { source: "currentFrame" });
                };
                const startRafSync = () => {
                    if (previewWidget._lnlRafId) {
                        return;
                    }
                    const tick = () => {
                        if (!isVideoPlaying(previewWidget)) {
                            previewWidget._lnlRafId = null;
                            return;
                        }
                        if (previewWidget.videoEl.currentTime !== lastTime) {
                            lastTime = previewWidget.videoEl.currentTime;
                            syncCurrentFrame();
                        }
                        previewWidget._lnlRafId = requestAnimationFrame(tick);
                    };
                    previewWidget._lnlRafId = requestAnimationFrame(tick);
                };
                const stopRafSync = () => {
                    if (previewWidget._lnlRafId) {
                        cancelAnimationFrame(previewWidget._lnlRafId);
                        previewWidget._lnlRafId = null;
                    }
                };
                previewWidget._videoEl.addEventListener('timeupdate', syncCurrentFrame);
                previewWidget._videoEl.addEventListener('seeked', syncCurrentFrame);
                previewWidget._videoEl.addEventListener('playing', (event) => {
                    startRafSync();

                    const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
                    if (sliderWidget) {
                        sliderWidget.pointerIsDown = false;
                    }
                });
                previewWidget._videoEl.addEventListener('pause', () => {
                    stopRafSync();
                });
                previewWidget._videoEl.addEventListener('ended', (event) => {
                    stopRafSync();
                    setPlayIcon(hostNode.playerControlsWidget);
                });                    
                
                if (!componentCreated || (componentCreated && !componentLoadedOrRefreshed)) {
                    previewWidget._videoEl.play();
                    setPauseIcon(hostNode.playerControlsWidget);
                }
                else {
                    stopRafSync();
                    setPlayIcon(hostNode.playerControlsWidget);
                }
            }
        }
        setTimeout(() => {
            lnl_fitHeight(hostNode);
        }, 10);
    });
    
    previewWidget._videoEl.addEventListener("error", () => {
        previewWidget.aspectRatio = infiniteAR;
        previewWidget.loaderEl.style['visibility'] = "hidden";
        lnl_fitHeight(hostNode);

        setTimeout(() => {
            previewWidget.value.params.frameDuration = 1;
            previewWidget.value.params.totalFrames = 1;

            setWidgetValue(hostNode, hostNode.currentFrameWidget, 1);
            setWidgetValue(hostNode, hostNode.inPointWidget, 1);
            setWidgetValue(hostNode, hostNode.outPointWidget, 1);

            const sliderWidgets = getDoubleSliderWidgets(hostNode);
            for (const sliderWidget of sliderWidgets) {
                sliderWidget.value.startMarkerFrame = 1;
                sliderWidget.value.endMarkerFrame = 1;
                sliderWidget.value.frameRate = 1;
            }

            if (this) {
                this.currentTime = 1;
            }

            const sliderWidget = getPrimaryDoubleSliderWidget(hostNode) ?? hostNode.doubleSliderWidget;
            if (sliderWidget) {
                updateSliderValues(sliderWidget, hostNode, 1, 1);
            }
            applyFrameState(hostNode, {
                totalFrames: 1,
                frameRate: 1,
                currentFrame: 1,
                inPoint: 1,
                outPoint: 1,
            }, { source: "error" });
            lnl_fitHeight(hostNode);
        }, 100);
    });

    previewWidget.updateSource = function () {
        if (this.mode === "image_sequence") {
            return;
        }
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
        if (!previewWidget.value) {
            previewWidget.value = { hidden: false, paused: false, params: {} };
        }
        if (!previewWidget.value.params || typeof previewWidget.value.params !== "object") {
            previewWidget.value.params = {};
        }
        if (previewWidget.mode === "image_sequence" && params?.filename) {
            previewWidget.useVideoSource();
        }
        Object.assign(previewWidget.value.params, params || {});
        previewWidget.updateSource();
        const shouldUseVideoAudio = !hostNode?._lnlUsingImageInput && !isInputConnected(hostNode, "audio");
        previewWidget._useVideoAudio = shouldUseVideoAudio;
        if (shouldUseVideoAudio) {
            previewWidget.setAudioSourceFromVideo?.();
            previewWidget.requestVideoAudioPreview?.();
        }
    };

    previewWidget.videoEl.getFrameForNValue = function (nvalue) {
        const frameAtValue = parseInt(nvalue * previewWidget.value.params.totalFrames / 100);
        return frameAtValue;
    };

    previewWidget.videoEl.getCurrentFrame = function () {
        const currentFrame = Math.round(this.currentTime / previewWidget.value.params.frameDuration) + 1;
        return currentFrame;
    };
    previewWidget.videoEl.getStartFrame = function () {
        const startFrame = 1;
        return startFrame;
    };
    previewWidget.videoEl.getInPointFrame = function () {
        const state = hostNode?._lnlFrameState;
        if (state?.inPoint) {
            return state.inPoint;
        }
        const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
        return sliderWidget?.value?.startMarkerFrame ?? 1;
    };
    previewWidget.videoEl.getOutPointFrame = function () {
        const state = hostNode?._lnlFrameState;
        if (state?.outPoint) {
            return state.outPoint;
        }
        const sliderWidget = getPrimaryDoubleSliderWidget(hostNode);
        return sliderWidget?.value?.endMarkerFrame ?? this.getEndFrame();
    };
    previewWidget.videoEl.getEndFrame = function () {
        const endFrame = previewWidget.value.params.totalFrames;
        return endFrame;
    };
    previewWidget.videoEl.setCurrentFrame = function (frame, options = {}) {
        const totalFrames = getTotalFramesFromNode(hostNode) || previewWidget.value.params.totalFrames || 1;
        const clampedFrame = clamp(frame, 1, totalFrames);
        if (previewWidget.value.params.duration && previewWidget.value.params.frameDuration) {
            this.currentTime = clampedFrame / totalFrames * previewWidget.value.params.duration - previewWidget.value.params.frameDuration;
        } else {
            this.currentTime = clampedFrame / totalFrames;
        }
        if (!options.skipAudio) {
            previewWidget.syncAudioToFrame?.(clampedFrame, { scrub: hostNode._lnlScrubActive });
        }
        if (!options.silent) {
            applyFrameState(hostNode, { currentFrame: clampedFrame }, { source: "currentFrame" });
        }
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
        applyFrameState(hostNode, { inPoint: valueToSet }, { source: "inPoint" });
    };
    previewWidget.videoEl.setOutPoint = function (value) {
        const currentFrame = this.getCurrentFrame();
        const valueToSet = value ? value : currentFrame;
        applyFrameState(hostNode, { outPoint: valueToSet }, { source: "outPoint" });
    };
    previewWidget.playPauseTriggeredCallback = () => {
        updatePlayPauseControl(previewWidget, hostNode.playerControlsWidget)
    };

    previewWidget._bindAudioToPlayer(previewWidget._videoEl);
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
    previewWidget.spinnerEl.appendChild(createLNLSpinner());
    previewWidget.loaderTextEl = document.createElement("div");
    previewWidget.loaderTextEl.className = "lnl-loader-text";
    previewWidget.loaderTextEl.textContent = "Processing...";
    previewWidget.spinnerEl.appendChild(previewWidget.loaderTextEl);
    previewWidget.loaderEl.appendChild(previewWidget.spinnerEl);

    previewWidget.processingEl = document.createElement("div");
    previewWidget.processingEl.className = "lnl-processing-overlay";
    previewWidget.processingEl.style.visibility = "hidden";
    previewWidget.processingSpinnerEl = document.createElement("div");
    previewWidget.processingSpinnerEl.className = "video-loading-spinner";
    previewWidget.processingSpinnerEl.appendChild(createLNLSpinner());
    previewWidget.processingTextEl = document.createElement("div");
    previewWidget.processingTextEl.className = "lnl-loader-text";
    previewWidget.processingTextEl.textContent = "Processing...";
    previewWidget.processingSpinnerEl.appendChild(previewWidget.processingTextEl);
    previewWidget.processingBarEl = document.createElement("div");
    previewWidget.processingBarEl.className = "lnl-loader-bar";
    previewWidget.processingBarFillEl = document.createElement("div");
    previewWidget.processingBarFillEl.className = "lnl-loader-bar-fill";
    previewWidget.processingBarEl.appendChild(previewWidget.processingBarFillEl);
    previewWidget.processingSpinnerEl.appendChild(previewWidget.processingBarEl);
    previewWidget.processingEl.appendChild(previewWidget.processingSpinnerEl);
    previewWidget.parentEl.appendChild(previewWidget.processingEl);

    previewWidget.setProcessing = (visible, message, progress) => {
        if (!previewWidget.processingEl) {
            return;
        }
        if (previewWidget._hostNode) {
            previewWidget._hostNode._lnlProcessingActive = !!visible;
        }
        if (typeof message === "string" && previewWidget.processingTextEl) {
            previewWidget.processingTextEl.textContent = message;
        }
        if (previewWidget.processingBarEl && previewWidget.processingBarFillEl) {
            if (progress && typeof progress.percent === "number" && Number.isFinite(progress.percent)) {
                const pct = clamp(progress.percent, 0, 100);
                previewWidget.processingBarEl.style.opacity = "1";
                previewWidget.processingBarFillEl.style.width = `${pct}%`;
            } else {
                previewWidget.processingBarEl.style.opacity = "0.4";
                previewWidget.processingBarFillEl.style.width = "30%";
            }
        }
        previewWidget.processingEl.style.visibility = visible ? "visible" : "hidden";
    };
}

// Utility
function updateSliderValues(widget, node, currentFrame, totalFrames) {
    if (!totalFrames || totalFrames <= 0) {
        totalFrames = 1;
    }
    const clampedCurrent = clamp(currentFrame ?? 1, 1, totalFrames);
    const existingValue = widget.value && typeof widget.value === "object" ? widget.value : {};
    widget.value = {
        ...existingValue,
        current: (clampedCurrent / totalFrames) * 100,
        currentFrame: clampedCurrent,
        totalFrames,
    };
    widget.label = `Frame: ${clampedCurrent} / ${totalFrames}`;
    requestNodeRedraw(node);
}

function getDoubleSliderWidgets(node) {
    if (!node) {
        return [];
    }
    const widgets = [];
    if (Array.isArray(node.widgets)) {
        for (const widget of node.widgets) {
            if (!widget) {
                continue;
            }
            if (widget.type === "double_slider" || widget.name === "in_out_point_slider") {
                widgets.push(widget);
            }
        }
    }
    if (node.doubleSliderWidget && !widgets.includes(node.doubleSliderWidget)) {
        widgets.push(node.doubleSliderWidget);
    }
    return widgets;
}

function getPrimaryDoubleSliderWidget(node) {
    const widgets = getDoubleSliderWidgets(node);
    if (!widgets.length) {
        return null;
    }
    const withFrames = widgets.find((widget) => widget?.value?.totalFrames);
    return withFrames ?? widgets[0];
}

function getTotalFramesFromNode(node) {
    const stateTotal = node?._lnlFrameState?.totalFrames;
    const sliderWidget = getPrimaryDoubleSliderWidget(node);
    const sliderTotal = sliderWidget?.value?.totalFrames;
    const paramsTotal = node?.previewWidget?.value?.params?.totalFrames;
    return Math.max(1, stateTotal ?? sliderTotal ?? paramsTotal ?? 1);
}

function setWidgetValue(node, widget, value) {
    if (!widget) {
        return;
    }
    const targetNode = node ?? widget.node;
    const canvas = app?.canvas;
    if (widget.setValue && targetNode && canvas) {
        const previousGuard = targetNode._lnlSuppressWidgetCallbacks;
        targetNode._lnlSuppressWidgetCallbacks = true;
        try {
            widget.setValue(value, { e: null, node: targetNode, canvas });
        } catch (err) {
            console.warn("LNL setWidgetValue fallback", err);
        } finally {
            targetNode._lnlSuppressWidgetCallbacks = previousGuard;
        }
    }
    widget.value = value;
    if (widget.inputEl && "value" in widget.inputEl) {
        widget.inputEl.value = value;
    }
    if (widget.input && "value" in widget.input) {
        widget.input.value = value;
    }
    if (widget.el && "value" in widget.el) {
        widget.el.value = value;
    }
    if (widget.element && "value" in widget.element) {
        widget.element.value = value;
    }
    targetNode?.graph?.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
}

function placeWidgetAfter(node, widgetToMove, referenceWidget) {
    if (!node || !Array.isArray(node.widgets) || !widgetToMove || !referenceWidget) {
        return;
    }
    const widgets = node.widgets;
    const moveIndex = widgets.indexOf(widgetToMove);
    const refIndex = widgets.indexOf(referenceWidget);
    if (moveIndex === -1 || refIndex === -1) {
        return;
    }
    if (moveIndex === refIndex + 1) {
        return;
    }
    widgets.splice(moveIndex, 1);
    const currentRefIndex = widgets.indexOf(referenceWidget);
    widgets.splice(currentRefIndex + 1, 0, widgetToMove);
}

function ensureFrameState(node) {
    if (!node._lnlFrameState) {
        node._lnlFrameState = {
            totalFrames: 1,
            frameRate: 1,
            currentFrame: 1,
            inPoint: 1,
            outPoint: 1,
            _lastChanged: "init",
        };
    }
    return node._lnlFrameState;
}

function normalizeFrameState(state) {
    state.totalFrames = Math.max(1, Math.floor(state.totalFrames || 1));
    state.inPoint = clamp(Math.floor(state.inPoint || 1), 1, state.totalFrames);
    state.outPoint = clamp(Math.floor(state.outPoint || state.totalFrames), 1, state.totalFrames);
    if (state.inPoint > state.outPoint) {
        if (state._lastChanged === "inPoint") {
            state.outPoint = state.inPoint;
        } else if (state._lastChanged === "outPoint") {
            state.inPoint = state.outPoint;
        } else {
            state.outPoint = state.inPoint;
        }
    }
    state.currentFrame = clamp(Math.floor(state.currentFrame || 1), 1, state.totalFrames);
}

function applyFrameState(node, updates, options = {}) {
    const state = ensureFrameState(node);
    const nextState = {
        ...state,
        ...updates,
    };
    if (options.source) {
        nextState._lastChanged = options.source;
    }
    normalizeFrameState(nextState);

    if (!options.force
        && state.totalFrames === nextState.totalFrames
        && state.frameRate === nextState.frameRate
        && state.currentFrame === nextState.currentFrame
        && state.inPoint === nextState.inPoint
        && state.outPoint === nextState.outPoint) {
        return;
    }

    Object.assign(state, nextState);

    if (updates.totalFrames !== undefined) {
        const widgetsToClamp = [node.currentFrameWidget, node.inPointWidget, node.outPointWidget];
        for (const widget of widgetsToClamp) {
            if (widget?.options) {
                widget.options.min = 1;
                widget.options.max = state.totalFrames;
            }
        }
    }

    if (node.previewWidget?.value?.params) {
        if (updates.totalFrames) {
            node.previewWidget.value.params.totalFrames = state.totalFrames;
        }
        if (updates.frameRate) {
            node.previewWidget.value.params.frameRate = state.frameRate;
        }
    }

    const sliderWidgets = getDoubleSliderWidgets(node);
    for (const sliderWidget of sliderWidgets) {
        const existingValue = sliderWidget.value && typeof sliderWidget.value === "object" ? sliderWidget.value : {};
        sliderWidget.value = {
            ...existingValue,
            startMarkerFrame: state.inPoint,
            endMarkerFrame: state.outPoint,
            frameRate: state.frameRate,
        };
        updateSliderValues(sliderWidget, node, state.currentFrame, state.totalFrames);
    }

    if (node.currentFrameWidget) setWidgetValue(node, node.currentFrameWidget, state.currentFrame);
    if (node.inPointWidget) setWidgetValue(node, node.inPointWidget, state.inPoint);
    if (node.outPointWidget) setWidgetValue(node, node.outPointWidget, state.outPoint);
    if (node.timelineWidget?.update) {
        node.timelineWidget.update(state);
    }
    node.audioEnvelopeWidget?.updateCurrentFrame?.(state.currentFrame);
    requestNodeRedraw(node);

    if (options.updateVideo && node.previewWidget?.videoEl) {
        node.previewWidget.videoEl.setCurrentFrame(state.currentFrame, { silent: true, skipAudio: options.skipAudio });
    }
}

function syncTimelineFromVideo(node) {
    if (!node?.previewWidget?.videoEl) {
        return;
    }
    const totalFrames = getTotalFramesFromNode(node);
    const currentFrame = clamp(node.previewWidget.videoEl.getCurrentFrame(), 1, totalFrames);
    const inPoint = clamp(node.previewWidget.videoEl.getInPointFrame(), 1, totalFrames);
    const outPoint = clamp(node.previewWidget.videoEl.getOutPointFrame(), 1, totalFrames);
    applyFrameState(node, {
        totalFrames,
        currentFrame,
        inPoint,
        outPoint,
    }, { source: "sync" });
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

let pauseListenerRegistered = false;
export function isFrameSelectorNode(node) {
    if (!node) {
        return false;
    }
    const comfyClass = node.comfyClass ?? "";
    const type = node.type ?? "";
    return comfyClass.includes("LNL Frame Selector")
        || comfyClass.includes("LNL_FrameSelector")
        || type.includes("LNL_FrameSelector");
}

function getFrameSelectorNodes() {
    return app?.graph?._nodes?.filter((node) => isFrameSelectorNode(node)) ?? [];
}

function markNodeNeedsUpdate(node) {
    if (!node) {
        return;
    }
    node._lnlNeedsUpdate = true;
}

function wrapWidgetCallback(widget, handler) {
    if (!widget) {
        return;
    }
    const original = widget.callback;
    widget.callback = function () {
        handler?.();
        return original?.apply(this, arguments);
    };
}

function setWaitingForOtherPause(activeNode, enabled) {
    const nodes = getFrameSelectorNodes();
    for (const node of nodes) {
        if (!node || node === activeNode) {
            continue;
        }
        const pauseWidget = node.widgets?.find((w) => w.name === "pause_on_execute");
        if (!pauseWidget?.value) {
            continue;
        }
        if (!node._lnlQueuedActive) {
            continue;
        }
        if (node._lnlPauseActive) {
            continue;
        }
        if (!node.previewWidget?.setProcessing) {
            continue;
        }
        if (enabled) {
            node._lnlWaitingForOtherPause = true;
            node.previewWidget.setProcessing(true, "Waiting for other pause...");
        } else if (node._lnlWaitingForOtherPause) {
            node._lnlWaitingForOtherPause = false;
            if (node._lnlQueuedActive) {
                node.previewWidget.setProcessing(true, "Queued for execution...");
            } else {
                node.previewWidget.setProcessing(false);
            }
        }
    }
}

function getNodeByUid(uid) {
    const graph = app?.graph;
    if (!graph) {
        return null;
    }
    const direct = graph._nodes_by_id?.[uid];
    if (direct) {
        return direct;
    }
    const nodes = graph._nodes ?? [];
    const target = String(uid);
    return nodes.find((node) => String(node?.id) === target) ?? null;
}

function getSingleFrameSelectorNode() {
    const nodes = getFrameSelectorNodes();
    return nodes.length === 1 ? nodes[0] : null;
}
function registerPauseListener() {
    if (pauseListenerRegistered) {
        return;
    }
    pauseListenerRegistered = true;
    api.addEventListener("lnl-frame-selector-pause", async (event) => {
        const payload = event?.detail || event;
        if (!payload) {
            return;
        }
        let node = getNodeByUid(payload.uid);
        if (!node) {
            node = getSingleFrameSelectorNode();
        }
        if (!node || !node.pauseControlsWidget) {
            return;
        }
        if (payload.graph_id !== undefined && payload.graph_id !== null && payload.graph_id !== "") {
            if (String(payload.graph_id) !== String(app.graph?.id)) {
                return;
            }
        }
        if (payload.timeout) {
            node.previewWidget?.setProcessing?.(false);
            node.pauseControlsWidget.setVisible(false);
            node._lnlPauseActive = false;
            setWaitingForOtherPause(node, false);
            return;
        }
        if (typeof payload.tick === "number") {
            node.pauseControlsWidget.setCountdown(payload.tick);
            return;
        }
        node.previewWidget?.setProcessing?.(false);
        node._lnlPauseActive = true;
        setWaitingForOtherPause(node, true);
        if (payload.preview_sequence && node.previewWidget?.useImageSequence) {
            node.previewWidget.useImageSequence(payload.preview_sequence, {
                currentFrame: payload.current_frame,
                inPoint: payload.in_point,
                outPoint: payload.out_point,
            });
        }
        if (payload.audio_envelope && node.audioEnvelopeWidget?.setEnvelope) {
            node.audioEnvelopeWidget.setEnvelope(payload.audio_envelope, payload.total_frames);
        } else {
            node.audioEnvelopeWidget?.setEnvelope?.(null, payload.total_frames);
        }
        if (node.previewWidget?.setAudioSource) {
            if (payload.audio_preview) {
                node.previewWidget.setAudioSource(payload.audio_preview);
                node._lnlUseVideoAudio = false;
            } else {
                node.previewWidget.clearAudioSource?.();
            }
        }
        if (payload?.total_frames) {
            const totalFrames = Math.max(1, payload.total_frames);
            const isNewMedia = node._lnlLastTotalFrames !== totalFrames;
            node._lnlLastTotalFrames = totalFrames;
            const payloadCurrent = Number(payload.current_frame);
            const payloadIn = Number(payload.in_point);
            const payloadOut = Number(payload.out_point);
            const shouldReset = isNewMedia
                || !Number.isFinite(payloadCurrent)
                || !Number.isFinite(payloadIn)
                || !Number.isFinite(payloadOut);
            const resolvedCurrent = shouldReset ? 1 : clamp(payloadCurrent, 1, totalFrames);
            const resolvedIn = shouldReset ? 1 : clamp(payloadIn, 1, totalFrames);
            const resolvedOut = shouldReset ? totalFrames : clamp(payloadOut, 1, totalFrames);
            applyFrameState(node, {
                totalFrames,
                currentFrame: resolvedCurrent,
                inPoint: resolvedIn,
                outPoint: resolvedOut,
            }, { source: "init", updateVideo: true, force: true, skipAudio: true });
            const selectEvery = shouldReset ? 1
                : Number.isFinite(Number(payload.select_every_nth_frame))
                    ? Number(payload.select_every_nth_frame)
                    : 1;
            setWidgetValue(node, node.selectEveryNthFrameWidget, selectEvery);
            requestNodeRedraw(node);
        }
        node._lnlPausePayload = payload;
        node.pauseControlsWidget.resetMessage();
        node.pauseControlsWidget.setVisible(true);
    });
    api.addEventListener("lnl-frame-selector-progress", (event) => {
        const payload = event?.detail || event;
        if (!payload) {
            return;
        }
        let node = getNodeByUid(payload.uid);
        if (!node) {
            node = getSingleFrameSelectorNode();
        }
        if (!node?.previewWidget?.setProcessing) {
            return;
        }
        if (payload.graph_id !== undefined && payload.graph_id !== null && payload.graph_id !== "") {
            if (String(payload.graph_id) !== String(app.graph?.id)) {
                return;
            }
        }
        if (node._lnlNeedsUpdate === false && !node._lnlQueuedActive && !node._lnlPauseActive) {
            return;
        }
        const message = typeof payload.message === "string" && payload.message.length
            ? payload.message
            : "Processing...";
        let progress = null;
        if (typeof payload.current === "number" && typeof payload.total === "number" && payload.total > 0) {
            progress = { percent: (payload.current / payload.total) * 100 };
        }
        node.previewWidget.setProcessing(true, message, progress);
    });
}

async function sendPauseResponse(node, { special } = {}) {
    const graphIdWidget = node.widgets?.find((w) => w.name === "graph_id");
    const graphId = graphIdWidget?.value ?? app.graph?.id ?? "";
    const payload = {
        graph_id: graphId,
        special: special ?? null,
        current_frame: node.currentFrameWidget?.value,
        in_point: node.inPointWidget?.value,
        out_point: node.outPointWidget?.value,
        select_every_nth_frame: node.selectEveryNthFrameWidget?.value,
    };
    const form = new FormData();
    form.append("response", JSON.stringify(payload));
    await api.fetchApi("/lnl-frame-selector-message", {
        method: "POST",
        body: form,
    });
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
                const fullFilePath = `${filename}`;
                if (Array.isArray(pathWidget?.options?.values)) {
                    if (!pathWidget.options.values.includes(fullFilePath)) {
                        pathWidget.options.values.push(fullFilePath);
                        pathWidget.options.values.sort();
                    }
                }
                setWidgetValue(hostNode, pathWidget, fullFilePath);
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
    uploadWidget._lnlFileInput = fileInput;
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
            return [0, 0];
        }
        return [target_width, 20];
    };
    widget.computeLayoutSize = () => ({
        minWidth: 0,
        minHeight: 0,
        maxWidth: 0,
        maxHeight: 0,
    });
    widget.draw = () => {};
    widget.mouse = () => true;
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

function hideWidgetVisually(widget) {
    if (!widget) {
        return;
    }
    enableHiddenTypeToggle(widget);
    widget.hidden = widget.hidden ?? true;
    if (!widget._lnlOriginalComputeSize) {
        widget._lnlOriginalComputeSize = widget.computeSize?.bind(widget);
    }
    if (!widget._lnlOriginalDraw) {
        widget._lnlOriginalDraw = widget.draw?.bind(widget);
    }
    if (!widget._lnlOriginalMouse) {
        widget._lnlOriginalMouse = widget.mouse?.bind(widget);
    }
    widget.computeSize = (target_width) => {
        if (widget.hidden) {
            return [0, 0];
        }
        if (widget._lnlOriginalComputeSize) {
            return widget._lnlOriginalComputeSize(target_width);
        }
        return [target_width, LiteGraph.NODE_WIDGET_HEIGHT];
    };
    // Only wrap custom draw/mouse handlers when they already exist.
    // For default LiteGraph widgets, overriding draw/mouse can hide visuals while keeping hit area active.
    if (widget._lnlOriginalDraw) {
        widget.draw = (ctx, node, widget_width, y, widget_height) => {
            if (widget.hidden) {
                return;
            }
            return widget._lnlOriginalDraw(ctx, node, widget_width, y, widget_height);
        };
    }
    if (widget._lnlOriginalMouse) {
        widget.mouse = function () {
            if (widget.hidden) {
                return true;
            }
            return widget._lnlOriginalMouse(...arguments);
        };
    }
    widget.serialize = true;
    applyWidgetVisibility(widget);
}

function enableHiddenTypeToggle(widget) {
    if (!widget || widget._lnlHiddenTypeToggle) {
        return;
    }
    widget._lnlHiddenTypeToggle = true;
    widget._lnlOriginalType = widget.type;
    Object.defineProperty(widget, "type", {
        get() {
            if (widget.hidden && !widget._lnlKeepTypeOnHide) {
                return "hidden";
            }
            return widget._lnlOriginalType;
        },
        set(value) {
            widget._lnlOriginalType = value;
        },
    });
}

function applyWidgetVisibility(widget) {
    if (!widget) {
        return;
    }
    const el = widget.inputEl || widget.input || widget.el || widget.element;
    if (!el || !el.style) {
        return;
    }
    if (widget.hidden) {
        el.style.display = "none";
        el.style.pointerEvents = "none";
        el.style.height = "0px";
        el.style.width = "0px";
    } else {
        el.style.display = "";
        el.style.pointerEvents = "";
        el.style.height = "";
        el.style.width = "";
    }
}

function setWidgetHidden(widget, hidden) {
    if (!widget) {
        return;
    }
    enableHiddenTypeToggle(widget);
    widget.hidden = hidden;
    applyWidgetVisibility(widget);
}

function setWidgetDisabled(widget, disabled) {
    if (!widget) {
        return;
    }
    widget.disabled = disabled;
    if (widget.options) {
        widget.options.read_only = disabled;
    }
    widget._disabled = disabled;
    if (disabled) {
        if (!widget._lnlOriginalCallback && widget.callback) {
            widget._lnlOriginalCallback = widget.callback;
        }
        if (widget._lnlDisabledValue === undefined) {
            widget._lnlDisabledValue = widget.value;
        }
        widget.callback = function () {
            if (widget._lnlDisabledValue !== undefined) {
                widget.value = widget._lnlDisabledValue;
            }
            widget.node?.graph?.setDirtyCanvas?.(true, true);
            app?.canvas?.setDirty?.(true, true);
        };
    } else if (widget._lnlOriginalCallback) {
        widget.callback = widget._lnlOriginalCallback;
        widget._lnlOriginalCallback = null;
        widget._lnlDisabledValue = null;
    }
    const el = widget.inputEl || widget.input || widget.el || widget.element;
    if (el && "disabled" in el) {
        el.disabled = disabled;
    }
    if (el && "tabIndex" in el) {
        if (disabled) {
            if (widget._lnlOriginalTabIndex === undefined) {
                widget._lnlOriginalTabIndex = el.tabIndex;
            }
            el.tabIndex = -1;
        } else if (widget._lnlOriginalTabIndex !== undefined) {
            el.tabIndex = widget._lnlOriginalTabIndex;
            widget._lnlOriginalTabIndex = undefined;
        }
    }
    if (el?.setAttribute) {
        if (disabled) {
            el.setAttribute("aria-disabled", "true");
        } else {
            el.removeAttribute("aria-disabled");
        }
    }
    if (el?.style) {
        el.style.opacity = disabled ? "0.6" : "";
        el.style.pointerEvents = disabled ? "none" : "";
        el.style.cursor = disabled ? "not-allowed" : "";
    }
}

function forceHiddenWidget(widget) {
    if (!widget) {
        return;
    }
    injectHidden(widget);
    widget.hidden = true;
    widget.type = "hidden";
    widget.height = 0;
    if (widget.inputEl?.style) {
        widget.inputEl.style.display = "none";
        widget.inputEl.style.position = "absolute";
        widget.inputEl.style.left = "-99999px";
        widget.inputEl.style.top = "0px";
        widget.inputEl.style.opacity = "0";
        widget.inputEl.style.pointerEvents = "none";
        widget.inputEl.style.width = "0px";
        widget.inputEl.style.height = "0px";
        widget.inputEl.style.minHeight = "0px";
        widget.inputEl.style.minWidth = "0px";
    }
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
    applyWidgetVisibility(customWidthWidget);
    applyWidgetVisibility(customHeightWidget);
}

function normalizePauseTimeoutWidget(node) {
    const pauseWidget = node?.widgets?.find((w) => w.name === "pause_timeout");
    if (!pauseWidget) {
        return;
    }
    const rawValue = pauseWidget.value;
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue > 0) {
        return;
    }
    const graphIdWidget = node.widgets?.find((w) => w.name === "graph_id");
    if (graphIdWidget && (!graphIdWidget.value || `${graphIdWidget.value}`.length === 0) && typeof rawValue === "string") {
        setWidgetValue(node, graphIdWidget, rawValue);
    }
    const fallback = pauseWidget.options?.default ?? 1000;
    setWidgetValue(node, pauseWidget, fallback);
}

function isInputConnected(node, name) {
    const inputs = node?.inputs || [];
    const inputIndex = inputs.findIndex((entry) => entry?.name === name);
    if (inputIndex === -1) {
        return false;
    }
    const input = inputs[inputIndex];
    if (input.link !== null && input.link !== undefined) {
        return true;
    }
    if (Array.isArray(input.links) && input.links.length) {
        return input.links.some((linkId) => linkId !== null && linkId !== undefined);
    }
    return false;
}

function updateVideoInputAvailability(node) {
    if (!node) {
        return;
    }
    const hasImageInput = isInputConnected(node, "images");
    const hasAudioInput = isInputConnected(node, "audio");
    const previousState = node._lnlUsingImageInput;
    node._lnlUsingImageInput = hasImageInput;
    if (node.pathWidget) {
        if (!node.pathWidget._lnlHideReady) {
            hideWidgetVisually(node.pathWidget);
            node.pathWidget._lnlHideReady = true;
        }
        setWidgetHidden(node.pathWidget, hasImageInput);
        setWidgetDisabled(node.pathWidget, hasImageInput);
    }
    if (node.uploadWidget) {
        if (!node.uploadWidget._lnlHideReady) {
            hideWidgetVisually(node.uploadWidget);
            node.uploadWidget._lnlHideReady = true;
        }
        setWidgetHidden(node.uploadWidget, hasImageInput);
        setWidgetDisabled(node.uploadWidget, hasImageInput);
    }
    if (!hasImageInput && node.previewWidget?.useVideoSource) {
        node.previewWidget.useVideoSource();
        if (previousState && node.pathWidget?.callback) {
            node.pathWidget.callback(node.pathWidget.value, true);
        }
    }
    if (node.previewWidget) {
        node._lnlUseVideoAudio = !hasImageInput && !hasAudioInput;
        if (node._lnlUseVideoAudio) {
            node.previewWidget._useVideoAudio = true;
            node.previewWidget.setAudioSourceFromVideo?.();
            node.previewWidget.requestVideoAudioPreview?.();
        } else if (!hasAudioInput) {
            node.previewWidget.clearAudioSource?.();
        }
    }
    lnl_fitHeight(node);
    requestNodeRedraw(node);
}

function scheduleInputAvailabilitySync(node) {
    if (!node) {
        return;
    }
    if (node._lnlInputSyncTimer) {
        clearTimeout(node._lnlInputSyncTimer);
        node._lnlInputSyncTimer = null;
    }
    let attempts = 0;
    const tick = () => {
        attempts += 1;
        updateVideoInputAvailability(node);
        if (attempts < 20) {
            node._lnlInputSyncTimer = setTimeout(tick, 100);
        } else {
            node._lnlInputSyncTimer = null;
        }
    };
    tick();
}

function syncImageConnectionState(node) {
    if (!node) {
        return;
    }
    const connected = isInputConnected(node, "images");
    if (node._lnlLastImagesConnected !== connected) {
        node._lnlLastImagesConnected = connected;
        updateVideoInputAvailability(node);
    }
}

// Create widgets
export async function createFrameSelectorWidgets(nodeType) {
    if (nodeType?.prototype?._lnlWidgetLifecyclePatched) {
        return;
    }
    nodeType.prototype._lnlWidgetLifecyclePatched = true;

    const originalNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        originalNodeCreated?.apply(this, arguments);
        registerPauseListener();

        const that = this;
        this._lnlNeedsUpdate = false;
        this.applyFrameState = (updates, options = {}) => applyFrameState(this, updates, options);

        // Create double slider widget (hidden canvas store)
        const doubleSliderWidget = createDoubleSliderWidget(this, "in_out_point_slider");
        forceHiddenWidget(doubleSliderWidget);
        doubleSliderWidget.inputEl.style.display = "none";
        doubleSliderWidget.inputEl.style.pointerEvents = "none";
        this.doubleSliderWidget = doubleSliderWidget;
        updateSliderValues(doubleSliderWidget, this, 1, 1);

        // Add video preview widget first so widget callbacks can safely target it.
        const previewWidget = createVideoPreviewWidget(this);
        this.previewWidget = previewWidget;

        // Add timeline widget
        const timelineWidget = createTimelineWidget(this);
        this.timelineWidget = timelineWidget;

        // Audio envelope widget (below timeline)
        const audioEnvelopeWidget = createAudioEnvelopeWidget(this);
        this.audioEnvelopeWidget = audioEnvelopeWidget;

        // Pause controls widget
        const pauseControlsWidget = createPauseControlsWidget(this);
        this.pauseControlsWidget = pauseControlsWidget;

        // Add path widget
        const pathWidget = this.widgets.find((w) => w.name === "video_path");
        if (!pathWidget) {
            console.warn("LNL: video_path widget not found during initialization");
            return;
        }
        pathWidget._lnlKeepTypeOnHide = true;
        setWidgetHidden(pathWidget, false);
        setWidgetDisabled(pathWidget, false);
        pathWidget.callback = (value, componentCreated) => {
            markNodeNeedsUpdate(that);
            if (typeof componentCreated === "boolean" && componentCreated === true) {
                this.componentCreated = true;
            }
            else {
                this.componentCreated = false;
            }
            if (this._lnlUsingImageInput) {
                return;
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
        placeWidgetAfter(this, uploadWidget, pathWidget);

        const sizeWidget = this.widgets.find((w) => w.name === 'force_size');
        const customWidthWidget = this.widgets.find((w) => w.name === 'custom_width');
        const customHeightWidget = this.widgets.find((w) => w.name === 'custom_height');
        const graphIdWidget = this.widgets.find((w) => w.name === 'graph_id');
        if (graphIdWidget) {
            hideWidgetVisually(graphIdWidget);
            graphIdWidget.hidden = true;
            setWidgetValue(this, graphIdWidget, `${app.graph?.id ?? ""}`);
            applyWidgetVisibility(graphIdWidget);
        }
        if (sizeWidget !== undefined) {
            hideWidgetVisually(customWidthWidget);
            hideWidgetVisually(customHeightWidget);
            if (customWidthWidget && (customWidthWidget.value === null || customWidthWidget.value === undefined)) {
                customWidthWidget.value = customWidthWidget.options?.default ?? 512;
            }
            if (customHeightWidget && (customHeightWidget.value === null || customHeightWidget.value === undefined)) {
                customHeightWidget.value = customHeightWidget.options?.default ?? 512;
            }
            sizeWidget.callback = (value) => {
                markNodeNeedsUpdate(that);
                updateCustomSizeLogic(sizeWidget, customWidthWidget, customHeightWidget);
                lnl_fitHeight(that);
            };
            wrapWidgetCallback(customWidthWidget, () => markNodeNeedsUpdate(that));
            wrapWidgetCallback(customHeightWidget, () => markNodeNeedsUpdate(that));
            updateCustomSizeLogic(sizeWidget, customWidthWidget, customHeightWidget);
            lnl_fitHeight(that);
        }
        normalizePauseTimeoutWidget(this);
        updateVideoInputAvailability(this);
        scheduleInputAvailabilitySync(this);

        // Add double slider widget (keep it hidden but serialized)
        document.body.appendChild(doubleSliderWidget.inputEl);
        const addedSliderWidget = this.addCustomWidget(doubleSliderWidget);
        const resolvedSliderWidgets = getDoubleSliderWidgets(this);
        const resolvedSliderWidget = addedSliderWidget ?? resolvedSliderWidgets[0] ?? doubleSliderWidget;
        for (const sliderWidget of resolvedSliderWidgets) {
            sliderWidget.inputEl = doubleSliderWidget.inputEl;
            sliderWidget.positionUpdatedCallback = doubleSliderWidget.positionUpdatedCallback;
            forceHiddenWidget(sliderWidget);
        }
        this.doubleSliderWidget = resolvedSliderWidget;

        // Create player controls widget
        const playerControlsWidget = createPlayerControlsWidget("player_controls", that, (control) => {
            switch (control) {
                case PlayerControls.gotoStart:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoStart();
                    syncTimelineFromVideo(that);
                    break;
                case PlayerControls.setInPoint:
                    previewWidget.videoEl.setInPoint();
                    {
                        const sliderWidget = getPrimaryDoubleSliderWidget(that) ?? doubleSliderWidget;
                        setWidgetValue(that, that.inPointWidget, sliderWidget.value.startMarkerFrame);
                    }
                    syncTimelineFromVideo(that);
                    that.graph?.setDirtyCanvas(true, true);
                    break;
                case PlayerControls.gotoInPoint:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoInPoint();
                    syncTimelineFromVideo(that);
                    break;
                case PlayerControls.stepBackward:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.regressOneFrame();
                    syncTimelineFromVideo(that);
                    break;
                case PlayerControls.playPause:
                    updatePlayPauseControl(previewWidget, playerControlsWidget);
                    if (!isVideoPlaying(previewWidget)) {
                        previewWidget.videoEl.play();
                    } else {
                        previewWidget.videoEl.pause();
                    }
                    syncTimelineFromVideo(that);
                    break;
                case PlayerControls.stepForward:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.advanceOneFrame();
                    syncTimelineFromVideo(that);
                    break;
                case PlayerControls.gotoOutPoint:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoOutPoint();
                    syncTimelineFromVideo(that);
                    break;
                case PlayerControls.setOutPoint:
                    previewWidget.videoEl.setOutPoint();
                    {
                        const sliderWidget = getPrimaryDoubleSliderWidget(that) ?? doubleSliderWidget;
                        setWidgetValue(that, that.outPointWidget, sliderWidget.value.endMarkerFrame);
                    }
                    syncTimelineFromVideo(that);
                    that.graph?.setDirtyCanvas(true, true);
                    break;
                case PlayerControls.gotoEnd:
                    pauseVideoIfPlaying(previewWidget, playerControlsWidget);
                    previewWidget.videoEl.gotoEnd();
                    syncTimelineFromVideo(that);
                    break;
            }                
        });
        this.playerControlsWidget = playerControlsWidget;

        // Add In/Out point and frame widgets
        const currentFrameWidget = this.addWidget("number", "current_frame", -1, (value) => {
            if (this._lnlSuppressWidgetCallbacks) {
                return;
            }
            markNodeNeedsUpdate(this);
            previewWidget.videoEl.setCurrentFrame(value);
        }, { min: 1, max: 1, step: 10, precision: 0 });
        this.currentFrameWidget = currentFrameWidget;

        const inPointWidget = this.addWidget("number", "in_point", -1, (value) => {
            if (this._lnlSuppressWidgetCallbacks) {
                return;
            }
            markNodeNeedsUpdate(this);
            previewWidget.videoEl.setInPoint(value);
        }, { min: 1, max: 1, step: 10, precision: 0 });
        this.inPointWidget = inPointWidget;

        const outPointWidget = this.addWidget("number", "out_point", -1, (value) => {
            if (this._lnlSuppressWidgetCallbacks) {
                return;
            }
            markNodeNeedsUpdate(this);
            previewWidget.videoEl.setOutPoint(value);
        }, { min: 1, max: 1, step: 10, precision: 0 });
        this.outPointWidget = outPointWidget;

        // Select every nth frame
        const selectEveryNthFrameWidget = this.addWidget("number", "select_every_nth_frame", 1, (value) => {
            if (this._lnlSuppressWidgetCallbacks) {
                return;
            }
            markNodeNeedsUpdate(this);
        }, { min: 1, step: 10, precision: 0 });
        this.selectEveryNthFrameWidget = selectEveryNthFrameWidget;

        // Make sure to reload video after refreshing
        setTimeout(() => {
            pathWidget.callback(pathWidget.value, true);
            updateVideoInputAvailability(this);
            scheduleInputAvailabilitySync(this);
            this.graph?.setDirtyCanvas(true, true);
        }, 10);

        // Cleanup
        this.serialize_widgets = true;

        const originalOnRemoved = this.onRemoved;
        this.onRemoved = function () {
            originalOnRemoved?.apply(this, arguments);
            doubleSliderWidget.inputEl.remove();
            if (this.uploadWidget?._lnlFileInput) {
                this.uploadWidget._lnlFileInput.remove();
            }
        };
        this.setSize(this.computeSize());
    };

    const originalOnConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info, input) {
        originalOnConnectionsChange?.apply(this, arguments);
        const inputName = input?.name ?? this.inputs?.[index]?.name;
        if (inputName === "images" || inputName === "audio") {
            markNodeNeedsUpdate(this);
        }
        if (inputName === "audio" && !connected) {
            this.previewWidget?.clearAudioSource?.();
        }
        updateVideoInputAvailability(this);
        if (inputName === "images" && connected) {
            scheduleInputAvailabilitySync(this);
        }
        if (inputName === "images" && !connected && this._lnlPauseActive) {
            this._lnlPauseActive = false;
            this.pauseControlsWidget?.setVisible(false);
            this.previewWidget?.setProcessing?.(false);
            sendPauseResponse(this, { special: "-3" });
        }
    };

    const originalOnDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function () {
        const result = originalOnDrawForeground?.apply(this, arguments);
        syncImageConnectionState(this);
        return result;
    };

    // Loading serialized data
    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
        originalOnConfigure?.apply(this, arguments);

        const sizeWidget = this.widgets.find((w) => w.name === 'force_size');
        const customWidthWidget = this.widgets.find((w) => w.name === 'custom_width');
        const customHeightWidget = this.widgets.find((w) => w.name === 'custom_height');
        const graphIdWidget = this.widgets.find((w) => w.name === 'graph_id');
        if (graphIdWidget) {
            hideWidgetVisually(graphIdWidget);
            graphIdWidget.hidden = true;
            setWidgetValue(this, graphIdWidget, `${app.graph?.id ?? ""}`);
            applyWidgetVisibility(graphIdWidget);
        }
        if (sizeWidget !== undefined) {
            if (customWidthWidget && (customWidthWidget.value === null || customWidthWidget.value === undefined)) {
                setWidgetValue(this, customWidthWidget, customWidthWidget.options?.default ?? 512);
            }
            if (customHeightWidget && (customHeightWidget.value === null || customHeightWidget.value === undefined)) {
                setWidgetValue(this, customHeightWidget, customHeightWidget.options?.default ?? 512);
            }
            updateCustomSizeLogic(sizeWidget, customWidthWidget, customHeightWidget);
            lnl_fitHeight(this);
        }
        normalizePauseTimeoutWidget(this);
        updateVideoInputAvailability(this);
        scheduleInputAvailabilitySync(this);
    };
}

/*
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):
*/
function lnl_fitHeight(node) {
    node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]])
    requestNodeRedraw(node);
}

function requestNodeRedraw(node) {
    node?.graph?.setDirtyCanvas?.(true, true);
    node?.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
    if (node?.graph) {
        node.graph._version = (node.graph._version ?? 0) + 1;
    }
}
