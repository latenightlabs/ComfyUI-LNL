'use strict';

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
export function addGroupToGraph(app, groupData) {
    // this.last_node_id = 0;
    // this.last_link_id = 0;

    // Add links
    // Add nodes
    const nodes = groupData.nodes;
    const nodeIdMapping = {};
    for (let i = 0; i < nodes.length; ++i) {
        const node = nodes[i];
        nodeIdMapping[node.id] = app.graph.last_node_id + i + 1;
        node.id = nodeIdMapping[node.id];
    }
    if (nodes) {
        for (let i = 0; i < nodes.length; ++i) {
            const n_info = nodes[i];
            const node = LiteGraph.createNode(n_info.type, n_info.title);

            console.log(`new node id: ${n_info.id}`);
            node.id = n_info.id;
            app.graph.add(node, true);
        }

        //configure nodes afterwards so they can reach each other
        for (let i = 0; i < nodes.length; ++i) {
            const n_info = nodes[i];
            const node = app.graph.getNodeById(n_info.id);
            console.log(`node id A: ${node.id}`)
            if (node) {
                node.configure(n_info);
            }
            console.log(`node id B: ${node.id}`)
        }
    }
    
    // Add groups

    // Update the canvas
    app.graph.updateExecutionOrder();

    if(app.graph.onConfigure)
        app.graph.onConfigure(groupData);

    app.graph._version++;
    app.graph.setDirtyCanvas(true, true);
}
