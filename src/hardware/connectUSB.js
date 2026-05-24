import { discover } from 'loupedeck'
import { logger } from '../utils/logger.js';

export async function connectLoupedeck() {
    logger.info("Recherche du Loupedeck en cours...");
    
    let device = null;
    while (!device) {
        try {
            device = await discover();
        } catch (e) {
            // On attend 3 secondes avant de réessayer si non trouvé
            await new Promise(res => setTimeout(res, 3000));
        }
    }
    
    return device;
}