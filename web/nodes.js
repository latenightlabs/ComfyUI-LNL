import { app } from "../../scripts/app.js";

import { createFrameSelectorWidgets } from "./VideoPlayer/videoPlayer.js";
import { registerGroupExtensions, setupConfigAndSerialization } from "./EnhancedGroups/enhancedGroups.js";

import { lnlAddStylesheet, lnlGetUrl } from "./utils.js";

function setQueuedOnOtherFrameSelectors(activeNode) {
    const nodes = activeNode?.graph?._nodes ?? app.graph?._nodes ?? [];
    for (const node of nodes) {
        if (!node || node === activeNode) {
            continue;
        }
        if (!node.comfyClass?.includes("LNL Frame Selector")) {
            continue;
        }
        if (node._lnlPauseActive || node._lnlWaitingForOtherPause) {
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

function setupFrameSelectorNodeHandlers(nodeType) {
    const originalOnExecutionStart = nodeType.prototype.onExecutionStart;
    nodeType.prototype.onExecutionStart = function () {
        this.previewWidget.videoEl.pause();
        const pauseWidget = this.widgets?.find((w) => w.name === "pause_on_execute");
        setQueuedOnOtherFrameSelectors(this);
        this._lnlQueuedActive = false;
        if (pauseWidget?.value) {
            this.previewWidget?.setProcessing?.(true, "Processing media...");
        }

        originalOnExecutionStart?.apply(this, arguments);
    };

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
        originalOnExecuted?.apply(this, arguments);
        this.previewWidget?.setProcessing?.(false);
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
    };

    const originalSetSize = nodeType.prototype.setSize;
    nodeType.prototype.setSize = function (size) {
        originalSetSize?.apply(this, arguments);

        const clampedWidth = Math.max(size[0], 390);
        this.size = [clampedWidth, size[1]];
    };
}

app.registerExtension({
    name: "LNL.Core",
    
    async init() {
        lnlAddStylesheet(lnlGetUrl("css/lnlNodes.css", import.meta.url));
        
        setupConfigAndSerialization();
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
