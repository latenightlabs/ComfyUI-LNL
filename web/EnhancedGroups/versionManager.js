'use strict';

import { fetchGroupsData, fetchGroupData, saveGroupData } from "./utils.js";

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

    async saveGroupData(groupData) {
        await saveGroupData(groupData);
    }

    versionedGroups() {
        return this.#versionedGroups;
    }
}
