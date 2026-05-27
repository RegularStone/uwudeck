// src/core/Uwudeck.js
import { connectLoupedeck, resetLoupedeckConnection } from '../hardware/connectUSB.js';
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
        const maxRetries = 5;
        let attempt = 0;
        let isConnected = false; // On ajoute un drapeau pour vérifier le succès

        // BOUCLE DE RÉSILIENCE : On essaie de se connecter ET de dessiner
        while (attempt < maxRetries) {
            this.device = await connectLoupedeck();
            this.drawer = new ScreenDrawer(this.device);

            try {
                await Promise.race([
                    this.drawer.resetScreen(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout lors du dessin (firmware bloqué)")), 1500))
                ]);

                logger.info("Loupedeck connecté et totalement opérationnel ! 🎉");
                isConnected = true; 
                break; 

            } catch (error) {
                attempt++;
                logger.warn(`Détection d'un blocage matériel (${attempt}/${maxRetries}) : ${error.message}. Redémarrage forcé...`);

                await resetLoupedeckConnection();
                this.device = null;
                
                await new Promise(res => setTimeout(res, 1000));
            }
        }

        // VÉRIFICATION APRÈS LA BOUCLE
        if (!isConnected) {
            logger.error("Échec critique : Impossible d'initialiser le Loupedeck après 5 tentatives.");
            process.exit(1); // On coupe l'application avec un code d'erreur (1) pour éviter un crash plus loin
        }

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