// src/core/Uwudeck.js
import { connectLoupedeck, resetLoupedeckConnection } from '../hardware/connectUSB.js';
import { ScreenDrawer }    from '../draw/ScreenDrawer.js';
import { ActiveProfile }   from '../actions/ActiveProfile.js';
import { FeedbackManager } from '../feedback/FeedbackManager.js';
import { StateStore }      from '../state/StateStore.js';
import { WebServer }       from '../web/server.js';
import { logger }          from '../utils/logger.js';

export class Uwudeck {
    constructor() {
        this.device          = null;
        this.drawer          = null;
        this.stateStore      = null;
        this.currentProfile  = null;
        this.feedbackManager = null;
        this.webServer       = null;
    }

    async start() {
        logger.info("Initialisation de l'application Uwudeck...");

        // ---- Connexion matérielle avec résilience ------------------- //
        const maxRetries = 5;
        let attempt      = 0;
        let isConnected  = false;

        while (attempt < maxRetries) {
            this.device = await connectLoupedeck();
            this.drawer = new ScreenDrawer(this.device);

            try {
                await Promise.race([
                    this.drawer.resetScreen(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout (firmware bloqué)')), 1500)
                    ),
                ]);

                logger.info('Loupedeck connecté et totalement opérationnel ! 🎉');
                isConnected = true;
                break;

            } catch (error) {
                attempt++;
                logger.warn(`Blocage matériel (${attempt}/${maxRetries}) : ${error.message}. Redémarrage...`);
                await resetLoupedeckConnection();
                this.device = null;
                await new Promise(res => setTimeout(res, 1000));
            }
        }

        if (!isConnected) {
            logger.error('Échec critique : impossible d\'initialiser le Loupedeck après 5 tentatives.');
            process.exit(1);
        }

        // ---- StateStore (variables d'état) -------------------------- //
        this.stateStore = new StateStore();

        // ---- Profil et feedback ------------------------------------- //
        this.currentProfile  = new ActiveProfile(this.device);
        this.feedbackManager = new FeedbackManager(this.device, this.stateStore);

        logger.info(`Profil chargé : "${this.currentProfile.profile.name}" (Page : "${this.currentProfile.getCurrentPageName()}")`);

        // ---- Resolvers statebar ------------------------------------ //
        this._registerStateBarResolvers();

        // ---- Serveur web ------------------------------------------- //
        this.webServer = new WebServer(this);
        this.webServer.start();

        // Broadcast WS à chaque changement de variable
        // (le redessin des feedbacks est géré dans handleInteraction ou via _refreshVisibleFeedbacks)
        this.stateStore.on('change', (name, value) => {
            this.webServer.broadcast({ type: 'variable:state_changed', name, value });
        });

        // ---- Listeners matériels ------------------------------------ //
        this.device.on('down', async ({ id }) => {
            await this.handleInteraction('buttons', id);
        });

        this.device.on('touchstart', async (e) => {
            if (e.touches?.length > 0) {
                const key = e.touches[0].target?.key;
                if (key !== undefined) {
                    await this.handleInteraction('touch', key);
                }
            }
        });

        this.device.on('rotate', async ({ id, delta }) => {
            await this.handleInteraction('knobs', id, delta);
        });

        // ---- Rendu initial des feedbacks visuels -------------------- //
        this._refreshVisibleFeedbacks();
    }

    // ---------------------------------------------------------------- //
    //  Gestion d'une interaction
    // ---------------------------------------------------------------- //

    async handleInteraction(sourceType, id, delta = null) {
        const result = this.currentProfile?.getAction(sourceType, id);
        if (!result) return;

        const { action, bindingId, effects } = result;

        // 1. Exécution de l'action métier
        action(delta);

        // 2. Effets sur les variables d'état (définis dans le binding)
        if (effects?.length && this.stateStore) {
            for (const effect of effects) {
                this._applyVariableEffect(effect);
            }
        }

        // 3. Déclenchement des feedbacks du binding pressé (inclut haptic, draw, led, screen)
        await this.feedbackManager.trigger(bindingId, sourceType, String(id));

        // 4. Si des variables ont changé, redessiner les autres bindings visibles
        if (effects?.length) {
            this._refreshVisibleFeedbacks(bindingId);
        }
    }

    /**
     * Redessine les feedbacks visuels de tous les bindings visibles,
     * en excluant optionnellement un binding déjà traité par trigger().
     */
    _refreshVisibleFeedbacks(excludeBindingId = null) {
        if (!this.currentProfile || !this.feedbackManager) return;
        const bindings = this.currentProfile.getVisibleBindings();
        for (const { bindingId, sourceType, keyId } of bindings) {
            if (bindingId === excludeBindingId) continue;
            this.feedbackManager.refresh(bindingId, sourceType, keyId).catch(err => {
                logger.warn(`Refresh feedback binding ${bindingId} : ${err.message}`);
            });
        }
    }

    _registerStateBarResolvers() {
        const audio    = this.currentProfile.registry.audio;
        const statebar = this.feedbackManager.renderers.statebar;

        statebar.registerResolver('GET_VOLUME_SYSTEM', () => audio.getSystemVolume());

        // Resolvers par app : GET_VOLUME_APP:<nomapp.exe>
        // ex: value_action: "GET_VOLUME_APP:chrome.exe"
        const originalGet = statebar._resolvers.get.bind(statebar._resolvers);
        statebar._resolvers.get = (key) => {
            const existing = originalGet(key);
            if (existing) return existing;
            const match = key?.match(/^GET_VOLUME_APP:(.+)$/);
            if (match) return () => audio.getAppVolume(match[1]);
            return undefined;
        };
    }

    _applyVariableEffect({ name, op, value }) {
        if (!name) return;
        if (op === 'toggle') {
            this.stateStore.set(name, !this.stateStore.get(name));
        } else if (op === 'set') {
            this.stateStore.set(name, value ?? null);
        }
    }

    // ---------------------------------------------------------------- //
    //  Arrêt propre
    // ---------------------------------------------------------------- //

    async stop() {
        this.webServer?.stop();
        if (this.device) {
            logger.info('Déconnexion du Loupedeck...');
            try {
                await this.device.close();
            } catch {
                logger.warn('Le port était déjà fermé ou indisponible lors de l\'arrêt.');
            } finally {
                this.device = null;
            }
        }
    }
}