'use strict';

import { app } from "../../../scripts/app.js"; // For LiteGraph

import { addGroupVersionToGraph, updateGroupFromJSONData } from "./utils.js";

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

async function saveGroup(menuItem, options, e, menu, groupNode, saveAsNew) {
    const groupHasVersioningData = groupNode.versioning_data !== undefined;

    const groupData = {
        versioning_data: groupNode.versioning_data
    };
    // Get component name if needed
    if (!groupHasVersioningData) {
        const componentName = prompt("Enter the component name:");
        if (!componentName) {
            return;
        }
        groupData.versioning_data = { object_name: componentName };
    }

    // Get group nodes
    groupData.nodes = groupNode._nodes.map(node => {
        return node.serialize();
    });

    // Process and remove links that are not between group nodes
    {
        const groupLinkIds = new Set([]);
        // TODO: Make sure that we're not saving links that are not between group nodes
        const groupNodeIds = groupNode._nodes.map(node => node.id);
        for (const node of groupNode._nodes) {
            if (node.inputs) {
                node.inputs.forEach(input => {
                    if (input.link) {
                        groupLinkIds.add(input.link);
                    }
                });
            }

            if (node.outputs) {
                node.outputs.forEach(output => {
                    if (output.links) {
                        output.links.forEach(link => {
                            groupLinkIds.add(link);
                        });
                    }
                });
            }
        }
        groupData.links = Array.from(groupLinkIds).map(linkId => {
            const linkIndex = app.graph.links.findIndex(link => {
                return link ? link.id === linkId : false;
            });
            if (linkIndex === -1) {
                return null;
            }
            return app.graph.links[linkIndex].serialize();
        }).filter(link => link !== null);
    }

    // Add group data
    groupData.group = groupNode.serialize();

    const jsonData = await versionManager.saveGroupData(groupData, saveAsNew);
    if (jsonData.error) {
        console.error(jsonData.error);
        return;
    }
    
    updateGroupFromJSONData(groupNode, jsonData);
}

function saveGroupAsNewVersion(menuItem, options, e, menu, groupNode) {
    const saveAsNew = true;
    saveGroup(menuItem, options, e, menu, groupNode, saveAsNew);
}

async function loadGroup(menuItem, options, e, menu, groupNode) {
    const data = await versionManager.loadGroupData(menuItem.extra.group.id);
    if (data["versions"].length === 0) {
        return;
    }

    addGroupVersionToGraph(app, data, groupNode, menuItem.extra.touchPos, menuItem.extra.groupVersion);
}

function extendCanvasMenu() {
    const oldProcessContextMenu = LGraphCanvas.prototype.processContextMenu;
    LGraphCanvas.prototype.processContextMenu = function(node, event) {
        var group = app.graph.getGroupOnPos(
            event.canvasX,
            event.canvasY
        );
        const touchPos = [event.canvasX, event.canvasY];
        if (!group) {
            const oldCanvasMenu = LGraphCanvas.prototype.getCanvasMenuOptions;
            LGraphCanvas.prototype.getCanvasMenuOptions = function() {
                const enhancedCanvasMenu = oldCanvasMenu.apply(this, arguments);
                const index = enhancedCanvasMenu.findIndex((o) => o?.content === "Add Group");
                if (index === -1) {
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
                                    options: versionManager.versionedGroups().map(group => {
                                        const latestVersion = group.versions[0]["id"] || "No versions available";
                                        const groupTitle = `${group.name} (v${latestVersion})`;
                                        return { content: groupTitle, callback: loadGroup, extra: { group, touchPos, groupVersion: latestVersion } };
                                    }),
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
        const object = serialize.apply(this, arguments);
        if (this.versioning_data) {
            const versioningData = {
                object_id: this.versioning_data?.object_id || null,
                object_name: this.versioning_data?.object_name || null,
                object_version: this.versioning_data?.object_version || null,
            };
            object.versioning_data = versioningData;
        }
        return object;
    };

    const configure = LGraphGroup.prototype.configure;
    LGraphGroup.prototype.configure = function(data) {
        configure.apply(this, arguments);
        if (data.versioning_data) {
            this.versioning_data = data.versioning_data;
        }
    };

    const oldGroupContextMenu = LGraphCanvas.prototype.getGroupMenuOptions;
    LGraphCanvas.prototype.getGroupMenuOptions = function(group) {
        var enhancedContextMenu = oldGroupContextMenu(group);
        enhancedContextMenu.push(null);

        const groupHasVersioningData = group.versioning_data !== undefined;
        const submenuOptions = [
            { content: "Save", callback: saveGroup },
        ];
        if (groupHasVersioningData) {
            let optionsObjects = [];
            const groupIndex = versionManager.versionedGroups().findIndex(obj => obj.id === group.versioning_data.object_id);
            if (groupIndex !== -1) {
                const currentGroupData = versionManager.versionedGroups()[groupIndex];
                optionsObjects = currentGroupData.versions.map(groupVersion => {
                    const lastModificationDatetime = new Date(groupVersion.timestamp).toLocaleString();
                    const groupTitle = `v${groupVersion.id} [${lastModificationDatetime}]`;
                    return { content: groupTitle, callback: loadGroup, extra: { group: currentGroupData, touchPos: undefined, groupVersion } };
                });
            }
            const versionedGroupOptions = [
                { content: "Save as new version", callback: saveGroupAsNewVersion },
                {
                    content: "Load version", has_submenu: true, submenu: {
                        title: "Available Versions",
                        extra: group,
                        options: optionsObjects
                    }
                },
                {
                    content: "Delete Version", has_submenu: true, submenu: {
                        title: "Available Versions",
                        options: optionsObjects.map(obj => {
                            // TODO: Map to deletion function
                            return { content: obj.content, callback: xxx, extra: obj.extra };
                        })
                    }
                },
            ];
            submenuOptions.push(...versionedGroupOptions);
        }
        const versionControlMenu = {
            content: "Versions",
            has_submenu: true,
            submenu: {
                title: "Version Control",
                extra: group,
                options: submenuOptions
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