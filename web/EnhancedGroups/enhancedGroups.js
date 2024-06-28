'use strict';

import { app } from "../../../scripts/app.js"; // For LiteGraph

import VersionManager from "./versionManager.js";
const versionManager = new VersionManager();

var initialGroupNodeRecomputed = false;

function xxx(menuItem, options, e, menu, groupNode, extra) {
    console.log(`groupNode: ${groupNode}`);
    console.log(`menuItem: ${menuItem.content}`);
    console.log(`extra.title: ${JSON.stringify(extra)}`);

    if (menu.parentMenu) {
        console.log(`menu.parentMenu: ${menu.parentMenu.extra}`);
    }
    
    // console.log(`groupNode: ${JSON.stringify(groupNode)}`);
    // console.log(`item: ${JSON.stringify(menuItemContent)}, options: ${JSON.stringify(options)}, e: ${JSON.stringify(e)}, menu: ${JSON.stringify(menu)}, node: ${JSON.stringify(node)}`);
    console.log(`item: ${JSON.stringify(menuItem)}, node.title: ${groupNode.title}, node.id: ${groupNode.id}, node._bounding: ${groupNode._bounding}, node.color: ${groupNode.color}, node.font_size: ${groupNode.font_size}`);
    console.log(`node is group: ${groupNode instanceof LGraphGroup}`);
    // iterate over group nodes
    for (const node of groupNode._nodes) {
        console.log(`subnode: ${node.title}, ${node.id}, ${node.pos}, ${node.size}, ${node.color}, ${node.font_size}`);
    }
    console.log(`menu: ${JSON.stringify(menuItem.title)}`);
}

function saveGroup(menuItem, options, e, menu, groupNode) {
    console.log("saveGroup");
}

function saveGroupAsNewVersion(menuItem, options, e, menu, groupNode) {
    console.log("saveGroupAsNewVersion");
}

async function loadGroup(menuItem, options, e, menu, groupNode) {
    const data = await versionManager.loadGroupData(menuItem.extra.id);
    console.log(`data: ${JSON.stringify(data)}`);
    if (data["versions"].length === 0) {
        return;
    }

    const oldConfigureGraph = LGraph.prototype.configure;
    // const oldConfigureGraph = app.graph.configure;
    console.log(`oldConfigureGraph: ${oldConfigureGraph}`);
    // app.graph.configure = function() {
    LGraph.prototype.configure = function() {
        console.log(`cheating the system: ${data}`)
        oldConfigureGraph.apply(this, [...arguments, true]);
    };
    console.log(`LGraph.prototype.configure: ${app.graph.configure}`);
    app.loadGraphData(data["versions"][0]);
    LGraph.prototype.configure = oldConfigureGraph;
    // app.graph.configure = oldConfigureGraph;
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
                                    options: versionManager.versionedGroups().map(group => ({ content: group.name, callback: loadGroup, extra: group })),
                                }
                            },
                        ],
                    }
                };
                
                return enhancedCanvasMenu;
            };
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
                            extra: node,
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