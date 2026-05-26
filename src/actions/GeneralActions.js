import { logger } from '../utils/logger.js';

export class GeneralActions {
    constructor(device) {
        this.device = device;
    }

    fakeAction1() {
        logger.info("🚀 Fake Action 1 exécutée !");
        
        return true; // Déclenchera un feedback haptique
    }

    fakeAction2() {
        logger.info("🎵 Fake Action 2 exécutée !");
        
        return false; // Ne déclenchera pas de feedback haptique (silencieux)
    }
}