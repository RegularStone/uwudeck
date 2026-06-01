// src/screensaver/ScreensaverRunner.js
import { SCREENSAVER_REGISTRY } from './index.js';
import { logger } from '../utils/logger.js';

export class ScreensaverRunner {
    constructor(device) {
        this.device    = device;
        this._running  = false;
        this._playing  = false; // one-shot en cours
        this._signal   = null;
    }

    /** Démarre la boucle infinie avec l'animation donnée. */
    async start(animationId) {
        if (this._running) return;
        const Anim = SCREENSAVER_REGISTRY.get(animationId);
        if (!Anim) { logger.warn(`ScreensaverRunner : animation "${animationId}" inconnue`); return; }

        this._running = true;
        const anim    = new Anim(this.device);

        while (this._running) {
            this._signal = { cancelled: false };
            try {
                await anim.runOnce(this._signal, false); // false = pas de blackout entre cycles
            } catch (err) {
                logger.warn(`ScreensaverRunner loop : ${err.message}`);
            }
        }
    }

    /** Stoppe la boucle (screensaver). */
    stop() {
        this._running = false;
        this._cancel();
    }

    /**
     * Joue une animation une seule fois (feedback one-shot).
     * Retourne false si une animation est déjà en cours.
     * @param {string} animationId
     * @param {Function} onDone — appelé après la fin pour redessiner l'écran
     */
    async playOnce(animationId, onDone) {
        if (this._playing || this._running) {
            logger.warn(`ScreensaverRunner : animation déjà en cours, ignoré`);
            return false;
        }
        const Anim = SCREENSAVER_REGISTRY.get(animationId);
        if (!Anim) { logger.warn(`ScreensaverRunner : animation "${animationId}" inconnue`); return false; }

        this._playing = true;
        const signal  = { cancelled: false };
        this._signal  = signal;
        const anim    = new Anim(this.device);
        try {
            await anim.runOnce(signal, true); // true = blackout à la fin
        } catch (err) {
            logger.warn(`ScreensaverRunner playOnce : ${err.message}`);
        }
        this._signal  = null;
        this._playing = false;

        if (!signal.cancelled && onDone) await onDone();
        return true;
    }

    _cancel() {
        if (this._signal) {
            this._signal.cancelled = true;
            if (this._signal._resolve) this._signal._resolve();
            this._signal = null;
        }
    }
}
