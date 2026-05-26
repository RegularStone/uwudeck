import { discover } from 'loupedeck';
import { logger } from '../utils/logger.js';

let deviceInstance = null; // Stockage interne de l'instance

export async function connectLoupedeck() {
    logger.info("Recherche du Loupedeck en cours...");
    
    while (!deviceInstance) {
        try {
            deviceInstance = await discover();
        } catch (e) {
            await new Promise(res => setTimeout(res, 3000));
        }
    }
    
    return deviceInstance;
}

export function getLoupedeck() {
    if (!deviceInstance) {
        throw new Error("Le Loupedeck n'a pas encore été initialisé !");
    }
    return deviceInstance;
}