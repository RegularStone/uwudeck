// src/actions/ActionsRegistry.js
import { GeneralActions } from './GeneralActions.js';
import { AudioActions }   from './AudioActions.js';
import { WindowActions }  from './WindowActions.js';
// StateStore reçu en paramètre du constructeur — pas d'import direct

export class ActionRegistry {
    /**
     * @param {object} device  - Instance Loupedeck
     * @param {object} profile - Instance ActiveProfile
     * @param {object} state   - Instance StateStore
     */
    constructor(device, profile, state) {
        const general = new GeneralActions(device);
        const windows = new WindowActions(state);
        this.audio    = new AudioActions();

        this.actions = {
            // Audio
            "VOLUME_SYSTEM_ROTATE": (ctx) => this.audio.changeSystemVolume(ctx.delta),
            "VOLUME_APP_ROTATE":    (ctx) => this.audio.changeAppVolume(ctx.delta, ctx.target),
            "MUTE_SYSTEM_TOGGLE":   ()    => this.audio.toggleSystemMute(),
            "MUTE_APP_TOGGLE":      (ctx) => this.audio.toggleAppMute(ctx.target),

            "SWITCH_AUDIO_OUTPUT": (ctx) => this.audio.switchAudioOutput(ctx.device),
            "SWITCH_AUDIO_INPUT":  (ctx) => this.audio.switchAudioInput(ctx.device),

            // Navigation
            "NEXT_PAGE":     () => { profile.nextPage();     return true; },
            "PREVIOUS_PAGE": () => { profile.previousPage(); return true; },

            // Système
            "OPEN_PATH": (ctx) => general.openPath(ctx.path),

            // Signet de fenêtre
            "BOOKMARK_SET":   (ctx) => windows.bookmarkSet(ctx.id),
            "BOOKMARK_FOCUS": (ctx) => windows.bookmarkFocus(ctx.id),
            "BOOKMARK_CLEAR": (ctx) => windows.bookmarkClear(ctx.id),
        };
    }

    get(actionName) {
        return this.actions[actionName] || null;
    }
}