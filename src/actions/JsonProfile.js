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

        // 1. Extraction de la configuration brute depuis le JSON
        let actionData = this.config.pages[activePageKey]?.[sourceType]?.[id] 
                      || this.config.globalBindings?.[sourceType]?.[id];

        if (!actionData) return null;

        // 2. Normalisation : qu'il s'agisse d'une string ou d'un objet, on crée un format unique
        let actionName = "";
        let jsonArgs = {};

        if (typeof actionData === "string") {
            actionName = actionData;
        } else if (typeof actionData === "object" && actionData.action) {
            actionName = actionData.action;
            // On extrait toutes les clés du JSON sauf "action" (ex: target, state, color, etc.)
            const { action, ...rest } = actionData;
            jsonArgs = rest;
        }

        // 3. Récupération de la fonction dans le registre
        const baseAction = this.registry.get(actionName);
        if (!baseAction) return null;

        // 4. L'enveloppe universelle : on passe un objet unique de contexte à l'action
        return (hardwareDelta = null) => {
            return baseAction({
                delta: hardwareDelta, // Donnée issue du matériel (molette)
                ...jsonArgs           // Toutes les données issues du JSON (target, etc.)
            });
        };
    }
}