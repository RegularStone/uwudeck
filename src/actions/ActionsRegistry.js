// src/actions/ActionsRegistry.js
import { GeneralActions } from './GeneralActions.js';

export class ActionRegistry {
    // On reçoit l'instance du profil ici
    constructor(device, profile) {
        const general = new GeneralActions(device);

        this.actions = {
            "VOLUME_SYSTEM_MUTE": () => general.fakeAction1(),
            "VOLUME_SYSTEM_ROTATE": (delta) => general.changeSystemVolume(delta),
            "SCROLL_ACTIVE_WINDOW": (delta) => general.fakeAction2(delta),
            "LAUNCH_PROXMOX_CHECK": () => general.fakeAction1(),
            
            // NEXT_PAGE devient une vraie action standard !
            "NEXT_PAGE": () => {
                profile.nextPage();
                return true; // Déclenchera la vibration haptique
            },

            "PREVIOUS_PAGE": () => {
                profile.previousPage();
                return true; // Déclenchera la vibration haptique
            }
        };
    }

    get(actionName) {
        return this.actions[actionName] || null;
    }
}