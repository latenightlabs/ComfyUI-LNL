'use strict';

import { fetchGroupsData, fetchGroupData } from "./utils.js";

export default class VersionManager {
    
    // constructor() {
    //     this.version = 0;
    //     this.versionKey = 'EnhancedGroupsVersion';
    //     this.version = parseInt(localStorage.getItem(this.versionKey));
    // }

    #versionedGroups = [];
    
    async loadVersionedGroups() {
        const result = await fetchGroupsData();
        this.#versionedGroups = result;
    }
    
    async loadGroupData(groupId) {
        const result = await fetchGroupData(groupId);
        return result;
    }

    versionedGroups() {
        return this.#versionedGroups;
    }
}
