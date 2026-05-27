// src/hardware/connectUSB.js
import { discover } from 'loupedeck';
import { logger } from '../utils/logger.js';

let deviceInstance = null; 

export async function connectLoupedeck() {
    logger.info("Recherche du Loupedeck en cours...");
    
    while (!deviceInstance) {
        try {
            deviceInstance = await discover();
        } catch (e) {
            await new Promise(res => setTimeout(res, 2000));
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

export async function resetLoupedeckConnection() {
    if (deviceInstance) {
        try {
            await deviceInstance.close();
        } catch (error) {
            logger.error("Erreur lors de la fermeture de la connexion Loupedeck", error);
        }
        deviceInstance = null; 
    }
}