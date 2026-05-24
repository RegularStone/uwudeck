// src/actions/index.js
import { logger } from '../utils/logger.js';

export function fakeAction1(device) {
    logger.info("🚀 Fake Action 1 exécutée !");
    device.vibrate();
}

export function fakeAction2(device) {
    logger.info("🎵 Fake Action 2 exécutée !");
    device.vibrate();
}