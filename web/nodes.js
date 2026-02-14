import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

import { createFrameSelectorWidgets } from "./VideoPlayer/videoPlayer.js";
import { registerGroupExtensions, setupConfigAndSerialization } from "./EnhancedGroups/enhancedGroups.js";

import { lnlAddStylesheet, lnlGetUrl } from "./utils.js";
import { isFrameSelectorNode } from "./VideoPlayer/videoPlayer.js";

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
        return true;
    }
    return false;
}

function getWidgetValue(node, name, fallback = null) {
    const widget = node.widgets?.find((w) => w.name === name);
    return widget ? widget.value : fallback;
}

function computeFrameSelectorSignature(node) {
    return JSON.stringify({
        video_path: getWidgetValue(node, "video_path", ""),
        force_size: getWidgetValue(node, "force_size", ""),
        custom_width: getWidgetValue(node, "custom_width", 0),
        custom_height: getWidgetValue(node, "custom_height", 0),
        pause_on_execute: !!getWidgetValue(node, "pause_on_execute", false),
        pause_timeout: getWidgetValue(node, "pause_timeout", 0),
        current_frame: getWidgetValue(node, "current_frame", 0),
        in_point: getWidgetValue(node, "in_point", 0),
        out_point: getWidgetValue(node, "out_point", 0),
        select_every_nth_frame: getWidgetValue(node, "select_every_nth_frame", 0),
        images_connected: isInputConnected(node, "images"),
        audio_connected: isInputConnected(node, "audio"),
        fps_connected: isInputConnected(node, "fps"),
    });
}

function setQueuedOnOtherFrameSelectors(activeNode) {
    if (!activeNode?._lnlNeedsUpdate) {
        return;
    }
    const nodes = activeNode?.graph?._nodes ?? app.graph?._nodes ?? [];
    for (const node of nodes) {
        if (!node || node === activeNode) {
            continue;
        }
        if (!isFrameSelectorNode(node)) {
            continue;
        }
        if (node._lnlPauseActive || node._lnlWaitingForOtherPause) {
            continue;
        }
        if (!node._lnlNeedsUpdate) {
            continue;
        }
        const signature = computeFrameSelectorSignature(node);
        if (node._lnlLastExecutedSignature === signature) {
            node._lnlNeedsUpdate = false;
            continue;
        }
        const pauseWidget = node.widgets?.find((w) => w.name === "pause_on_execute");
        if (!pauseWidget?.value) {
            continue;
        }
        node._lnlQueuedActive = true;
        node.previewWidget?.setProcessing?.(true, "Queued for execution...");
    }
}

function clearQueuedFrameSelectorOverlays() {
    const nodes = app.graph?._nodes ?? [];
    for (const node of nodes) {
        if (!node || !isFrameSelectorNode(node)) {
            continue;
        }
        if (node._lnlPauseActive) {
            continue;
        }
        if (node._lnlQueuedActive || node._lnlWaitingForOtherPause) {
            node._lnlQueuedActive = false;
            node._lnlWaitingForOtherPause = false;
            node.previewWidget?.setProcessing?.(false);
        }
    }
}

function setupFrameSelectorNodeHandlers(nodeType) {
    if (nodeType?.prototype?._lnlExecutionHandlersPatched) {
        return;
    }
    nodeType.prototype._lnlExecutionHandlersPatched = true;

    const originalOnExecutionStart = nodeType.prototype.onExecutionStart;
    nodeType.prototype.onExecutionStart = function () {
        this.previewWidget?.videoEl?.pause?.();
        const pauseWidget = this.widgets?.find((w) => w.name === "pause_on_execute");
        const signature = computeFrameSelectorSignature(this);
        const lastSignature = this._lnlLastSignature ?? this._lnlLastExecutedSignature;
        if (lastSignature === signature) {
            this._lnlNeedsUpdate = false;
        } else {
            this._lnlNeedsUpdate = true;
        }
        this._lnlLastSignature = signature;
        setQueuedOnOtherFrameSelectors(this);
        this._lnlQueuedActive = false;
        if (pauseWidget?.value && (this._lnlNeedsUpdate ?? true)) {
            this.previewWidget?.setProcessing?.(true, "Processing media...");
        }

        originalOnExecutionStart?.apply(this, arguments);
    };

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
        originalOnExecuted?.apply(this, arguments);
        this.previewWidget?.setProcessing?.(false);
        this._lnlNeedsUpdate = false;
        this._lnlQueuedActive = false;
        const valueOrFirst = (value) => {
            if (Array.isArray(value)) {
                return value.length ? value[0] : undefined;
            }
            return value;
        };
        const readOutputValue = (idx, names) => {
            if (!output) {
                return undefined;
            }
            const fromArray = valueOrFirst(output?.[idx] ?? output?.output?.[idx] ?? output?.outputs?.[idx]);
            if (fromArray !== undefined) {
                return fromArray;
            }
            if (output?.output && typeof output.output === "object") {
                for (const name of names) {
                    if (name in output.output) {
                        return valueOrFirst(output.output[name]);
                    }
                }
            }
            if (output?.outputs && typeof output.outputs === "object") {
                for (const name of names) {
                    if (name in output.outputs) {
                        return valueOrFirst(output.outputs[name]);
                    }
                }
            }
            if (typeof output === "object") {
                for (const name of names) {
                    if (name in output) {
                        return valueOrFirst(output[name]);
                    }
                }
            }
            return undefined;
        };

        const frameIn = readOutputValue(2, ["Frame in", "frame_in", "frame in"]);
        const frameOut = readOutputValue(3, ["Frame out", "frame_out", "frame out"]);
        const frameCountAbs = readOutputValue(6, ["Frame count (abs)", "frame_count_abs", "frame count (abs)"]);
        const currentFrameAbs = readOutputValue(8, ["Current frame (abs)", "current_frame_abs", "current frame (abs)"]);
        const frameRateFloat = readOutputValue(10, ["Frame rate (FLOAT)", "frame_rate_float", "frame rate (float)"]);
        const frameRateInt = readOutputValue(9, ["Frame rate (INT)", "frame_rate_int", "frame rate (int)"]);

        const totalFrames = Number.isFinite(Number(frameCountAbs)) ? Number(frameCountAbs) : undefined;
        const currentFrame = Number.isFinite(Number(currentFrameAbs)) ? Number(currentFrameAbs) : undefined;
        const inPoint = Number.isFinite(Number(frameIn)) ? Number(frameIn) : undefined;
        const outPoint = Number.isFinite(Number(frameOut)) ? Number(frameOut) : undefined;
        const frameRate = Number.isFinite(Number(frameRateFloat)) ? Number(frameRateFloat)
            : Number.isFinite(Number(frameRateInt)) ? Number(frameRateInt) : undefined;

        const updates = {};
        if (totalFrames !== undefined) updates.totalFrames = totalFrames;
        if (currentFrame !== undefined) updates.currentFrame = currentFrame;
        if (inPoint !== undefined) updates.inPoint = inPoint;
        if (outPoint !== undefined) updates.outPoint = outPoint;
        if (frameRate !== undefined) updates.frameRate = frameRate;

        if (Object.keys(updates).length && this.previewWidget) {
            this.previewWidget.value = this.previewWidget.value || { params: {} };
            this.previewWidget.value.params = this.previewWidget.value.params || {};
            if (updates.totalFrames !== undefined) {
                this.previewWidget.value.params.totalFrames = updates.totalFrames;
            }
            if (updates.frameRate !== undefined) {
                this.previewWidget.value.params.frameRate = updates.frameRate;
            }
            this.previewWidget.value.params.frameDuration = updates.frameRate ? 1 / updates.frameRate : this.previewWidget.value.params.frameDuration;
            this.previewWidget.value.params.duration = updates.frameRate && updates.totalFrames ? updates.totalFrames / updates.frameRate : this.previewWidget.value.params.duration;
        }
        if (Object.keys(updates).length && this.applyFrameState) {
            this.applyFrameState(updates);
        } else if (Object.keys(updates).length && this.timelineWidget?.update) {
            this.timelineWidget.update({
                totalFrames: updates.totalFrames ?? this._lnlFrameState?.totalFrames ?? 1,
                currentFrame: updates.currentFrame ?? this._lnlFrameState?.currentFrame ?? 1,
                inPoint: updates.inPoint ?? this._lnlFrameState?.inPoint ?? 1,
                outPoint: updates.outPoint ?? this._lnlFrameState?.outPoint ?? 1,
            });
        }
        this._lnlLastExecutedSignature = computeFrameSelectorSignature(this);
        this._lnlLastSignature = this._lnlLastExecutedSignature;
    };

    const originalSetSize = nodeType.prototype.setSize;
    nodeType.prototype.setSize = function (size) {
        originalSetSize?.apply(this, arguments);

        const currentSize = Array.isArray(size) ? size : this.size;
        if (!Array.isArray(currentSize) || currentSize.length < 2) {
            return;
        }
        const clampedWidth = Math.max(currentSize[0], 390);
        this.size = [clampedWidth, currentSize[1]];
    };
}

app.registerExtension({
    name: "LNL.Core",
    
    async init() {
        lnlAddStylesheet(lnlGetUrl("css/lnlNodes.css", import.meta.url));
        
        setupConfigAndSerialization();
        api.addEventListener("execution_end", clearQueuedFrameSelectorOverlays);
        api.addEventListener("execution_error", clearQueuedFrameSelectorOverlays);
        api.addEventListener("execution_interrupted", clearQueuedFrameSelectorOverlays);
        api.addEventListener("status", (event) => {
            const remaining = event?.detail?.exec_info?.queue_remaining;
            if (typeof remaining === "number" && remaining === 0) {
                clearQueuedFrameSelectorOverlays();
            }
        });
    },
    async setup() {
        registerGroupExtensions();
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name.indexOf("LNL_FrameSelector") !== -1) {
            await createFrameSelectorWidgets(nodeType);

            setupFrameSelectorNodeHandlers(nodeType);
        }
    },
});
