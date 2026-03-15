'use strict';

import { app } from "../../scripts/app.js"; // For LiteGraph

import { clamp } from "./utils.js";

export function handleLNLMouseEvent(event, pos, node, positionUpdatedCallback) {
    const width = node.size[0];

    for (var i = 0; i < node.widgets.length; ++i) {
        const w = node.widgets[i];
        const widthMargin = typeof w._track_left === "number"
            ? w._track_left
            : (typeof w.width_margin === "number" ? w.width_margin : 10);
        const widget_width = typeof w._track_width === "number"
            ? w._track_width
            : (w.width || width) - 2 * widthMargin;
        const x = pos[0] - widthMargin;

        if (event.type == LiteGraph.pointerevents_method+"down") {
            w.pointerIsDown = true;
        }
        else if (event.type == LiteGraph.pointerevents_method+"up") {
            w.pointerIsDown = false;
        }
        switch (w.type) {
            case "double_slider":
                var old_value = w.value.current;
                if (widget_width <= 0) {
                    break;
                }
                var nvalue = clamp((x) / (widget_width), 0, 1);
                w.value.current = w.options.min + (w.options.max - w.options.min) * nvalue;
                if (old_value != w.value.current) {
                    setTimeout(function() {
                        positionUpdatedCallback(w.value.current);
                    }, 20);
                }
                break;
            default:
                break;
        }
    }
    return false;
}
