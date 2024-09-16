'use strict';

import { app } from "../../scripts/app.js"; // For LiteGraph

import { clamp } from "./utils.js";

export function handleLNLMouseEvent(event, pos, node, positionUpdatedCallback) {
    const width = node.size[0];

    for (var i = 0; i < node.widgets.length; ++i) {
        const w = node.widgets[i];
        const widget_width = (w.width || width) - 2*w.width_margin;
        const x = pos[0] - w.width_margin;

        if (event.type == LiteGraph.pointerevents_method+"down") {
            w.pointerIsDown = true;
        }
        else if (event.type == LiteGraph.pointerevents_method+"up") {
            w.pointerIsDown = false;
        }
        switch (w.type) {
            case "double_slider":
                var old_value = w.value.current;
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
