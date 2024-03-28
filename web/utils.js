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

/*
Attribution: ComfyUI-Custom-Scripts

Portions of this code are adapted from GitHub repository `https://github.com/pythongosssss/ComfyUI-Custom-Scripts`,
which is licensed under the MIT License:
*/
export function lnlAddStylesheet(url) {
    $el("link", {
        parent: document.head,
        rel: "stylesheet",
        type: "text/css",
        href: url.startsWith("http") ? url : lnlGetUrl(url),
    });
}

/*
Attribution: ComfyUI-Custom-Scripts

Portions of this code are adapted from GitHub repository `https://github.com/pythongosssss/ComfyUI-Custom-Scripts`,
which is licensed under the MIT License:
*/
export function lnlGetUrl(path, baseUrl) {
    if (baseUrl) {
        return new URL(path, baseUrl).toString();
    }
    else {
        return new URL("../" + path, import.meta.url).toString();
    }
}

/*
Attribution: ComfyUI-VideoHelperSuite

Portions of this code are adapted from GitHub repository `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite`,
which is licensed under the GNU General Public License version 3 (GPL-3.0):
*/
export async function lnlUploadFile(file) {
    //TODO: Add uploaded file to cache with Cache.put()?
    try {
        // Wrap file in formdata so it includes filename
        const body = new FormData();
        const i = file.webkitRelativePath.lastIndexOf('/');
        const subfolder = file.webkitRelativePath.slice(0,i+1)
        const new_file = new File([file], file.name, {
            type: file.type,
            lastModified: file.lastModified,
        });
        body.append("image", new_file);
        if (i > 0) {
            body.append("subfolder", subfolder);
        }
        const resp = await api.fetchApi("/upload/image", {
            method: "POST",
            body,
        });

        if (resp.status === 200) {
            return resp.status
        } else {
            alert(resp.status + " - " + resp.statusText);
        }
    } catch (error) {
        alert(error);
    }
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
