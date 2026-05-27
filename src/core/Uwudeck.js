// src/core/Uwudeck.js
import { connectLoupedeck } from '../hardware/connectUSB.js';
import { ScreenDrawer } from '../draw/ScreenDrawer.js';
import { JsonProfile } from '../actions/JsonProfile.js';
import { logger } from '../utils/logger.js';

import profileData from '../configs/profile_template.json' with { type: 'json' };

export class Uwudeck {
    constructor() {
        this.device = null;
        this.drawer = null;
        this.currentProfile = null;
    }

    async start() {
        logger.info("Initialisation de l'application Uwudeck...");
        
        this.device = await connectLoupedeck();
        logger.info("Loupedeck connecté avec succès ! 🎉");

        this.drawer = new ScreenDrawer(this.device);
        await this.drawer.resetScreen();

        this.currentProfile = new JsonProfile(this.device, profileData);
        logger.info(`Profil JSON chargé : ${profileData.profileName} (Page active: ${this.currentProfile.getCurrentPageName()})`);

        this.device.on('down', async ({ id }) => {
            await this.handleInteraction('buttons', id);
        });

        this.device.on('touchstart', async (e) => {
            if (e.touches && e.touches.length > 0) {
                const key = e.touches[0].target?.key;
                if (key !== undefined) {
                    await this.handleInteraction('touch', key);
                }
            }
        });

        this.device.on('rotate', async ({ id, delta }) => {
            await this.handleInteraction('knobs', id, delta);
        });
    }

    // Gestionnaire d'interaction universel et ULTRA fluide
    async handleInteraction(sourceType, id, delta = null) {
        const action = this.currentProfile?.getAction(sourceType, id);

        if (action) {
            // On exécute l'action, peu importe ce qu'elle fait en interne !
            const wantHaptic = action(delta);

            if (wantHaptic) {
                try {
                    await this.device.vibrate(0x32); // Vibration courte et douce
                } catch (error) {
                    logger.error("Impossible de faire vibrer l'appareil", error);
                }
            }
        }
    }

    async stop() {
    if (this.device) {
        logger.info("Déconnexion du Loupedeck...");
        try {
            await this.device.close(); 
        } catch (error) {
            logger.warn("Le port était déjà fermé ou indisponible lors de l'arrêt.");
        } finally {
            // Dans tous les cas, on nettoie notre variable
            this.device = null;
        }
    }}
}