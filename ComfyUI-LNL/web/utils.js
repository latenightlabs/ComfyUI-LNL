'use strict';

import { api } from "../../../scripts/api.js";
import { $el } from "../../../scripts/ui.js";

export async function processVideoEntry(path, videoDuration) {
    const body = {
        path: path,
    };
    const result = await api.fetchApi("/process_video_entry", { method: "POST", body: JSON.stringify(body) });
    if (result.error) {
        console.error(`processVideoEntry error: ${result.error}`);
        return undefined;
    }
    const jsonData = await result.json();
    const frameDuration = videoDuration / jsonData.total_frames;
    jsonData.frame_duration = frameDuration;
    return jsonData;
}

export function lnlAddStylesheet(url) {
    $el("link", {
        parent: document.head,
        rel: "stylesheet",
        type: "text/css",
        href: url.startsWith("http") ? url : lnlGetUrl(url),
    });
}

export function lnlGetUrl(path, baseUrl) {
    if (baseUrl) {
        return new URL(path, baseUrl).toString();
    }
    else {
        return new URL("../" + path, import.meta.url).toString();
    }
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
