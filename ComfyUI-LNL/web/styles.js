'use strict';

import { clamp } from "./utils.js";

export function getBastePositionStyle(ctx, widget_width, y, node, widget_height) {
    const margin = 10;
    const scale = ctx.getTransform().a;
    const showText = scale > 0.6;

    const h = LiteGraph.NODE_WIDGET_HEIGHT;
    for (var i = 0; i < node.widgets.length; ++i) {
        const w = node.widgets[i];

        if(w.disabled) {
            ctx.globalAlpha *= 0.5;
        }
        switch (w.type) {
            case "double_slider":
                w.width_margin = margin;
                ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR;
                ctx.fillRect(margin, y, widget_width - margin * 2, h);
                var range = w.options.max - w.options.min;
                var nvalue = (w.value.current - w.options.min) / range;
                if(nvalue < 0.0) nvalue = 0.0;
                if(nvalue > 1.0) nvalue = 1.0;

                //// Draw progress bar backgrounds
                // Start marker
                let startNValue = 0.0;
                if (w.value.startMarkerFrame !== undefined) {
                    const markerPosition = w.value.startMarkerFrame * 100 / w.value.totalFrames;
                    startNValue = clamp((markerPosition - w.options.min) / range, 0.0, 1.0);

                    ctx.fillStyle = "#99B8AA";
                    ctx.fillRect(margin, y, Math.min(startNValue, nvalue) * (widget_width - margin * 2), h);
                }

                // End marker
                let endNValue = 1.0;
                if (w.value.endMarkerFrame !== undefined) {
                    const markerPosition = w.value.endMarkerFrame * 100 / w.value.totalFrames;
                    endNValue = clamp((markerPosition - w.options.min) / range, 0.0, 1.0);

                    if (nvalue > endNValue) {
                        ctx.fillStyle = "#BA6C6A";
                        ctx.fillRect(margin + endNValue * (widget_width - margin * 2), y, (Math.min(1.0, nvalue) - endNValue) * (widget_width - margin * 2), h);
                    }
                }

                // Position marker
                if (nvalue > startNValue) {
                    ctx.fillStyle = w.options.hasOwnProperty("slider_color") ? w.options.slider_color : "#678";
                    ctx.fillRect(margin + startNValue * (widget_width - margin * 2), y, (Math.min(nvalue, endNValue) - startNValue) * (widget_width - margin * 2), h);
                }

                //// Draw markers
                // Start marker
                if (w.value.startMarkerFrame !== undefined) {
                    ctx.fillStyle = "#16C172";
                    ctx.fillRect(margin + startNValue * (widget_width - margin * 2), y - h * 0.125, 2, h * 1.25);
                }

                // End marker
                if (w.value.endMarkerFrame !== undefined) {
                    ctx.fillStyle = "#C12926";
                    ctx.fillRect(margin + endNValue * (widget_width - margin * 2), y - h * 0.125, 2, h * 1.25);
                }

                // Position marker
                if (w.pointerIsDown && w.marker) {
                    const markerPosition = w.value.currentFrame * 100 / w.value.totalFrames;
                    var marker_nvalue = clamp((markerPosition - w.options.min) / range, 0.0, 1.0);
                    ctx.fillStyle = w.options.hasOwnProperty("marker_color") ? w.options.marker_color : "#AA9";
                    ctx.fillRect(margin + marker_nvalue * (widget_width - margin * 2), y - h * 0.125, 2, h * 1.25);

                    ctx.strokeStyle = ctx.fillStyle;
                    ctx.strokeRect(margin + marker_nvalue * (widget_width - margin * 2) - 3, y - h * 0.125 - 5, 8, h * 1.25 + 10);
                }

                if (showText) {
                    ctx.textAlign = "center";
                    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
                    ctx.fillText(
                        w.label || w.name + "  " + Number(w.value.current).toFixed(
                                                        w.options.precision != null
                                                            ? w.options.precision
                                                            : 3
                                                    ),
                        widget_width * 0.5,
                        y + h * 0.7
                    );
                }
                break;
            default:
                break;
        }
    }

    const elRect = ctx.canvas.getBoundingClientRect();
    const transform = new DOMMatrix()
        .scaleSelf(elRect.width / ctx.canvas.width, elRect.height / ctx.canvas.height)
        .multiplySelf(ctx.getTransform())
        .translateSelf(margin, margin + y);

    return {
        transformOrigin: '0 0',
        transform: transform,
        left: `0px`, 
        top: `0px`,
        position: "absolute",
        maxWidth: `${widget_width - margin * 2}px`,
        maxHeight: `${widget_height - margin*2}px`,
        width: `auto`,
        height: `auto`,
    }
}
