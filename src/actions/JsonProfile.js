// src/actions/JsonProfile.js
import { ActionRegistry } from './ActionsRegistry.js';
import { logger } from '../utils/logger.js';

export class JsonProfile {
    constructor(device, jsonConfig) {
        this.device = device;
        this.config = jsonConfig;
        
        // CORRECTION : On passe 'this' pour que le registre puisse appeler .nextPage()
        this.registry = new ActionRegistry(device, this);
        
        this.pageKeys = Object.keys(jsonConfig.pages);
        this.currentPageIndex = 0;
    }

    getCurrentPageName() {
        const activeKey = this.pageKeys[this.currentPageIndex];
        return this.config.pages[activeKey]?.pageName || "Inconnue";
    }

    nextPage() {
        this.currentPageIndex = (this.currentPageIndex + 1) % this.pageKeys.length;
        logger.info(`🔄 Passage au sous-profil : ${this.getCurrentPageName()}`);
    }

    previousPage() {
        this.currentPageIndex = (this.currentPageIndex - 1 + this.pageKeys.length) % this.pageKeys.length;
        logger.info(`🔄 Retour au sous-profil : ${this.getCurrentPageName()}`);
    }

    getAction(sourceType, id) {
        const activePageKey = this.pageKeys[this.currentPageIndex];

        const pageActionName = this.config.pages[activePageKey]?.[sourceType]?.[id];
        if (pageActionName) return this.registry.get(pageActionName);

        const globalActionName = this.config.globalBindings?.[sourceType]?.[id];
        if (globalActionName) return this.registry.get(globalActionName);

        return null;
    }
}