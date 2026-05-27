// src/actions/ActionsRegistry.js
import { GeneralActions } from './GeneralActions.js';
import { AudioActions } from './AudioActions.js';

export class ActionRegistry {
    // On reçoit l'instance du profil ici
    constructor(device, profile) {
        const general = new GeneralActions(device);
        const audio = new AudioActions();

        this.actions = {
            // Actions audio (on propage juste l'objet de contexte)
            "VOLUME_SYSTEM_ROTATE": (ctx) => audio.changeSystemVolume(ctx.delta),
            "VOLUME_APP_ROTATE": (ctx) => audio.changeAppVolume(ctx.delta, ctx.target),
            "MUTE_SYSTEM_TOGGLE": () => audio.toggleSystemMute(),
            "MUTE_APP_TOGGLE": (ctx) => audio.toggleAppMute(ctx.target),

            // Navigation
            "NEXT_PAGE": () => { profile.nextPage(); return true; },
            "PREVIOUS_PAGE": () => { profile.previousPage(); return true; }
        };
    }

    get(actionName) {
        return this.actions[actionName] || null;
    }
}