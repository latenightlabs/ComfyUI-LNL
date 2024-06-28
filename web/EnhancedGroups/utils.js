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
    // Add links
    // Add nodes
    const nodes = groupData.nodes;
    if (nodes) {
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var n_info = nodes[i]; //stored info
            var node = LiteGraph.createNode(n_info.type, n_info.title);
            if (!node) {
                if (LiteGraph.debug) {
                    console.log(
                        "Node not found or has errors: " + n_info.type
                    );
                }

                //in case of error we create a replacement node to avoid losing info
                node = new LGraphNode();
                node.last_serialization = n_info;
                node.has_errors = true;
                error = true;
                //continue;
            }

            node.id = n_info.id; //id it or it will create a new id
            app.graph.add(node, true); //add before configure, otherwise configure cannot create links
        }

        //configure nodes afterwards so they can reach each other
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var n_info = nodes[i];
            var node = app.graph.getNodeById(n_info.id);
            if (node) {
                node.configure(n_info);
            }
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
