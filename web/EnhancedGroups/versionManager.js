'use strict';

import { fetchGroupsData, fetchGroupData, saveGroupData } from "./utils.js";

export default class VersionManager {
    
    #versionedGroups = [];
    
    async loadVersionedGroups() {
        const result = await fetchGroupsData();
        this.#versionedGroups = result;
    }
    
    async loadGroupData(groupId) {
        const result = await fetchGroupData(groupId);
        return result;
    }

    async saveGroupData(groupData, saveAsNew) {
        const result = await saveGroupData(groupData, saveAsNew);
        if (result.error) {
            return result;
        }

        const newVersionedGroupData = {
            id: result.id,
            name: result.name,
            versions: result.versions.map(v => v.id ),
        };
        const index = this.#versionedGroups.findIndex(obj => obj.id === result.id);
        if (index === -1) {
            this.#versionedGroups.push(newVersionedGroupData);
        } else {
            this.#versionedGroups[index] = newVersionedGroupData;
        }

        return result;
    }

    versionedGroups() {
        return this.#versionedGroups;
    }
}
