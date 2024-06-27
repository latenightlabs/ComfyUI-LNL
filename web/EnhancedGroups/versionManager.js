'use strict';

import { fetchGroupsData } from "./utils.js";

export default class VersionManager {
    
    // constructor() {
    //     this.version = 0;
    //     this.versionKey = 'EnhancedGroupsVersion';
    //     this.version = parseInt(localStorage.getItem(this.versionKey));
    // }

    #versionedGroups = [];

    saveGroup(menuItem, options, e, menu, groupNode) {
        console.log("saveGroup");
    }
    
    saveGroupAsNewVersion(menuItem, options, e, menu, groupNode) {
        console.log("saveGroupAsNewVersion");
    }
    
    loadGroup(menuItem, options, e, menu, groupNode) {
        console.log(`loadGroup menuItemContent: ${menuItem.content}`);
    }
    
    async loadVersionedGroups() {
        const result = await fetchGroupsData();
        this.#versionedGroups = result.map(group => group.name);
    }
    
    versionedGroups() {
        return this.#versionedGroups;
    }
}
