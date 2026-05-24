import { connectLoupedeck } from './src/hardware/connectUSB.js';
import { logger } from './src/utils/logger.js';
import * as draw from './src/draw/index.js';

let loupedeckDevice = null;

async function init() {
    logger.info("Initialisation du script principal...");
    loupedeckDevice = await connectLoupedeck();
    logger.info("Loupedeck connecté avec succès ! 🎉");

    await draw.resetScreenDraw(loupedeckDevice);

    loupedeckDevice.on('down', ({ id }) => {
        logger.info(`Bouton ${id} pressé !`);
        loupedeckDevice.vibrate();
    });
}
// Gestion de la fermeture propre (Ctrl+C ou déconnexion)
process.on('SIGINT', () => {
    if (loupedeckDevice) {
        logger.info("Déconnexion du Loupedeck...");
        loupedeckDevice.close();
    }
    logger.forceLogSync('INFO', "Script fermé proprement.");
    process.exit(0);
});

init();