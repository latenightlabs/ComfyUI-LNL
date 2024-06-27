'use strict';

import { app } from "../../../scripts/app.js"; // For LiteGraph

import VersionManager from "./versionManager.js";
const versionManager = new VersionManager();

var initialGroupNodeRecomputed = false;

function xxx(menuItemContent, options, e, menu, groupNode) {
    // console.log(`item: ${JSON.stringify(menuItemContent)}, options: ${JSON.stringify(options)}, e: ${JSON.stringify(e)}, menu: ${JSON.stringify(menu)}, node: ${JSON.stringify(node)}`);
    console.log(`item: ${JSON.stringify(menuItemContent)}, node.title: ${groupNode.title}, node.id: ${groupNode.id}, node._bounding: ${groupNode._bounding}, node.color: ${groupNode.color}, node.font_size: ${groupNode.font_size}`);
    console.log(`node is group: ${groupNode instanceof LGraphGroup}`);
    // iterate over group nodes
    for (const node of groupNode._nodes) {
        console.log(`subnode: ${node.title}, ${node.id}, ${node.pos}, ${node.size}, ${node.color}, ${node.font_size}`);
    }
    console.log(`menu: ${JSON.stringify(menu.title)}`);
}

function extendCanvasMenu() {
    const oldProcessContextMenu = LGraphCanvas.prototype.processContextMenu;
    LGraphCanvas.prototype.processContextMenu = function(node, event) {
        var group = app.graph.getGroupOnPos(
            event.canvasX,
            event.canvasY
        );
        if (!group) {
            const oldCanvasMenu = LGraphCanvas.prototype.getCanvasMenuOptions;
            LGraphCanvas.prototype.getCanvasMenuOptions = function() {
                const enhancedCanvasMenu = oldCanvasMenu.apply(this, arguments);
                const index = enhancedCanvasMenu.findIndex((o) => o?.content === "Add Group");
                if (index === -1) {
                    return enhancedCanvasMenu;
                }
                if (enhancedCanvasMenu[index].submenu) {
                    return enhancedCanvasMenu;
                }

                enhancedCanvasMenu[index] = {
                    content: "Add Group", has_submenu: true, submenu: {
                        title: "Add Group",
                        options: [
                            { content: "Empty group", callback: LGraphCanvas.onGroupAdd },
                            {
                                content: "Versioned group", has_submenu: true, submenu: {
                                    title: "Groups",
                                    options: versionManager.versionedGroups().map(group => ({ content: group, callback: versionManager.loadGroup })),
                                }
                            },
                        ],
                    }
                };
                
                return enhancedCanvasMenu;
            };
            // const oldMenuClose = ContextMenu.close;
            // ContextMenu.close = function(e, ignore_parent_menu) {
            //     console.log(`§§§§`)
            //     oldMenuClose.apply(this, arguments);
            // }
        }   

        oldProcessContextMenu.apply(this, arguments);
    };
}

function extendGroupContextMenu() {
    const serialize = LGraphGroup.prototype.serialize;
    LGraphGroup.prototype.serialize = function() {
        if (!initialGroupNodeRecomputed) {
            this.recomputeInsideNodes();
            initialGroupNodeRecomputed = true;
        }
        // console.log(`node.title: ${this.title}, node.id: ${this.id}, node._bounding: ${this._bounding}, node.color: ${this.color}, node.font_size: ${this.font_size}`);
        // console.log(`node is group: ${this instanceof LGraphGroup}`)
        // console.log(`this._nodes: ${this._nodes.length}`)
        for (const node of this._nodes) {
            // console.log(`subnode: ${node.title}, ${node.id}, ${node.pos}, ${node.size}, ${node.color}, ${node.font_size}`);
        }
        const object = serialize.apply(this, arguments);
        const versioningData = {
            nodes: this._nodes.map(node => node.id),
            objectName: this.versioningData?.objectName || "undefined",
            objectVersion: this.versioningData?.objectVersion || 0,
        };
        object.versioningData = versioningData;
        return object;
    };

    const oldGroupContextMenu = LGraphCanvas.prototype.getGroupMenuOptions;
    LGraphCanvas.prototype.getGroupMenuOptions = function(node) {
        var enhancedContextMenu = oldGroupContextMenu(node);
        enhancedContextMenu.push(null);

        const versionControlMenu = {
            content: "Versions",
            has_submenu: true,
            submenu: {
                title: "Version Control",
                extra: node,
                options: [
                    { content: "Save", callback: saveGroup },
                    { content: "Save as new version", callback: saveGroupAsNewVersion },
                    {
                        content: "Load version", has_submenu: true, submenu: {
                            title: "Available Versions",
                            options: [
                                { content: "Version 1", callback: xxx },
                                { content: "Version 2", callback: xxx }
                            ]
                        }
                    },
                    {
                        content: "Delete Version", has_submenu: true, submenu: {
                            title: "Available Versions",
                            options: [
                                { content: "Version 1", callback: xxx },
                                { content: "Version 2", callback: xxx }
                            ]
                        }
                    },
                ]
            },
        };
        enhancedContextMenu.push(versionControlMenu);
        return enhancedContextMenu;
    };
}

export async function registerGroupExtensions() {
    extendGroupContextMenu();
    extendCanvasMenu();

    await versionManager.loadVersionedGroups();
}