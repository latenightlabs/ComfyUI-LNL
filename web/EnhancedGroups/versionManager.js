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
        const result = await saveGroupData(groupData);

        const index = this.#versionedGroups.findIndex(obj => obj.id === result.id);
        if (index === -1) {
            const newVersionedGroupData = {
                id: result.id,
                name: result.name,
                versions: result.versions.map(v => v.id ),
            };
            this.#versionedGroups.push(newVersionedGroupData);
        } else {
            // Implement for updating versioned group data which already exists
        }

        return result;
    }

    versionedGroups() {
        return this.#versionedGroups;
    }
}
