'use strict';

import { app } from "../../../scripts/app.js"; // For LiteGraph
import { api } from "../../../scripts/api.js";

// API utils
export async function fetchGroupsData() {
    const result = await api.fetchApi("/fetch_groups_data", { method: "GET" });
    if (result.error) {
        console.error(`fetchGroupsData error: ${result.error}`);
        return undefined;
    }
    const jsonData = await result.json();
    return jsonData;
}

export async function fetchGroupData(groupId) {
    const result = await api.fetchApi(`/fetch_group_data?groupId=${groupId}`, { method: "GET" });
    if (result.error) {
        console.error(`fetchGroupsData error: ${result.error}`);
        return undefined;
    }
    const jsonData = await result.json();
    return jsonData;
}

// Litegraph utils
export function addGroupToGraph(app, groupData, touchPos) {
    /// Recalculate positions based on click coordinates which tell us where the
    /// lower-left corner of the group should be
    const nodes = groupData.nodes;
    const groups = groupData.groups;
    if (!nodes || !groups || groups.length !== 1) {
        return;
    }

    const nodesGroup = groups[0];
    // 1) Make node positions relative to group's
    for (let i = 0; i < nodes.length; ++i) {
        const node = nodes[i];
        node.pos[0] = node.pos[0] - nodesGroup.bounding[0];
        node.pos[1] = node.pos[1] - nodesGroup.bounding[1];
    }
    // 2) Make group lower-left position the same as touch position
    nodesGroup.bounding[0] = touchPos[0];
    nodesGroup.bounding[1] = touchPos[1] - nodesGroup.bounding[3];
    // 3) Make node positions absolute
    for (let i = 0; i < nodes.length; ++i) {
        const node = nodes[i];
        node.pos[0] = node.pos[0] + nodesGroup.bounding[0];
        node.pos[1] = node.pos[1] + nodesGroup.bounding[1];
    }

    /// Remap node IDs
    const nodeIDMapping = {};
    for (let i = 0; i < nodes.length; ++i) {
        const node = nodes[i];
        nodeIDMapping[node.id] = app.graph.last_node_id + i + 1;
        node.id = nodeIDMapping[node.id];
    }

    /// Remap link IDs and link's origin/target node IDs
    const links = groupData.links;
    const linkIDMapping = {};
    if (links && links.constructor === Array) {
        for (let i = 0; i < links.length; ++i) {
            const link = links[i];
            linkIDMapping[link[0]] = app.graph.last_link_id + i + 1;
            link[0] = linkIDMapping[link[0]];
            link[1] = nodeIDMapping[link[1]];
            link[3] = nodeIDMapping[link[3]];
        }
    }

    /// Remap nodes' input/output links
    for (let i = 0; i < nodes.length; ++i) {
        const node = nodes[i];

        const linkArrays = [];
        if (node.inputs) {
            linkArrays.push(node.inputs);
        }
        if (node.outputs) {
            linkArrays.push(node.outputs);
        }
        for (let j = 0; j < linkArrays.length; ++j) {
            const inOutItem = linkArrays[j];
            for (let k = 0; k < inOutItem.length; ++k) {
                const connection = inOutItem[k];
                if (connection.links) {
                    for (let l = 0; l < connection.links.length; ++l) {
                        connection.links[l] = linkIDMapping[connection.links[l]];
                    }
                }
                if (connection.link) {
                    connection.link = linkIDMapping[connection.link];
                }
            }
        }
    }

    /// Add links
    if (links && links.constructor === Array) {
        const preparedLinks = [];
        for (let i = 0; i < links.length; ++i) {
            const link_data = links[i];

            var link = new LiteGraph.LLink();
            link.configure(link_data);
            preparedLinks.push(link);
        }
        if (!app.graph.links || app.graph.links.constructor !== Array || app.graph.links.length === 0) {
            app.graph.links = [];
        }
        app.graph.links.push(...preparedLinks);
        app.graph.last_link_id += links.length;
    }

    /// Add nodes
    // Create new nodes
    for (let i = 0; i < nodes.length; ++i) {
        const n_info = nodes[i];
        const node = LiteGraph.createNode(n_info.type, n_info.title);

        node.id = n_info.id;
        app.graph.add(node, true);
    }

    // Configure nodes with saved data
    for (let i = 0; i < nodes.length; ++i) {
        const n_info = nodes[i];
        const node = app.graph.getNodeById(n_info.id);
        if (node) {
            node.configure(n_info);
        }
    }
    
    /// Add group
    var group = new LiteGraph.LGraphGroup();
    group.configure(groups[0]);
    app.graph.add(group);

    /// Update the canvas
    app.graph.updateExecutionOrder();

    if (app.graph.onConfigure) {
        app.graph.onConfigure(groupData);
    }

    app.graph._version++;
    app.graph.setDirtyCanvas(true, true);
}
