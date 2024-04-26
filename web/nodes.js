import { app } from "../../scripts/app.js";

import { createWidgets } from "./widgets.js";
import { lnlAddStylesheet, lnlGetUrl } from "./utils.js";

function setupNodeHandlers(nodeType) {
    const originalOnExecutionStart = nodeType.prototype.onExecutionStart;
    nodeType.prototype.onExecutionStart = function () {
        this.previewWidget.videoEl.pause();

        originalOnExecutionStart?.apply(this, arguments);
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
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== "LNL_FrameSelector" && nodeData?.name !== "LNL_FrameSelectorV2") {
            return;
        }
        await createWidgets(nodeType);

        setupNodeHandlers(nodeType);
    },
});
