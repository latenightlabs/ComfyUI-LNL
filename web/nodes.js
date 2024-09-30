import { app } from "../../scripts/app.js";

import { createFrameSelectorWidgets } from "./VideoPlayer/videoPlayer.js";
import { registerGroupExtensions, setupConfigAndSerialization } from "./enhancedGroups/enhancedGroups.js";

import { lnlAddStylesheet, lnlGetUrl } from "./utils.js";

function setupFrameSelectorNodeHandlers(nodeType) {
    const originalOnExecutionStart = nodeType.prototype.onExecutionStart;
    nodeType.prototype.onExecutionStart = function () {
        this.previewWidget.videoEl.pause();

        originalOnExecutionStart?.apply(this, arguments);
    };

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
        originalOnExecuted?.apply(this, arguments);
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
