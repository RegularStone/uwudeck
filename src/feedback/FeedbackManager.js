// src/feedback/FeedbackManager.js
import { EventEmitter } from 'events';
import { ProfileRepository } from '../db/ProfileRepository.js';
import { HAPTIC } from '../../constants.js';
import { logger } from '../utils/logger.js';
// StateStore importé dynamiquement via le constructeur (pas de singleton ici)

// Renderers draw — touche tactile individuelle (drawKey)
import { FillRenderer }     from './renderers/FillRenderer.js';
import { TextRenderer }     from './renderers/TextRenderer.js';
import { IconRenderer }     from './renderers/IconRenderer.js';
import { StateBarRenderer } from './renderers/StateBarRenderer.js';

/**
 * FeedbackManager
 *
 * Écoute l'événement 'binding:triggered' et exécute les feedbacks
 * (haptic, led, draw, screen) associés au binding déclenché.
 *
 * Découplage total : les actions ne connaissent pas les feedbacks.
 *
 * Types de feedback :
 *   haptic → vibration
 *   led    → couleur d'un bouton physique
 *   draw   → dessin sur une touche tactile individuelle (drawKey)
 *   screen → scène nommée sur la zone centrale complète (drawCanvas)
 *            → enregistrer via feedbackManager.registerScreenAction(name, fn)
 *
 * Usage :
 *   feedbackManager.trigger(bindingId, keyType, keyId)
 */
export class FeedbackManager extends EventEmitter {

    /**
     * @param {object}     device      - Instance Loupedeck
     * @param {StateStore} stateStore  - Variables d'état runtime
     */
    constructor(device, stateStore) {
        super();
        this.device     = device;
        this.stateStore = stateStore;
        this.repo       = new ProfileRepository();

        // Renderers pour drawKey (touch individuelle)
        this.renderers = {
            fill:     new FillRenderer(device),
            text:     new TextRenderer(device),
            icon:     new IconRenderer(device),
            statebar: new StateBarRenderer(device),
        };

        // Registre des scènes pour drawCanvas (zone centrale complète)
        // Clé : nom de la scène (string)  →  Valeur : async (device, params) => void
        // Enregistrement : feedbackManager.registerScreenAction('ma_scene', async (device, params) => { ... })
        this._screenActions = new Map();

    }

    // ---------------------------------------------------------------- //
    //  Registre des scènes screen (drawCanvas)
    // ---------------------------------------------------------------- //

    /**
     * Enregistre une scène pour le feedback de type 'screen'.
     * La fonction reçoit le device et les params du feedback.
     *
     * @param {string}   name - Nom de la scène, référencé dans params.scene
     * @param {Function} fn   - async (device, params) => void
     *
     * @example
     * feedbackManager.registerScreenAction('page_audio_layout', async (device, params) => {
     *     await device.drawCanvas({ id: 'center', width: 480, height: 288, x: 0, y: 0 },
     *         (ctx, w, h) => { ... }
     *     );
     * });
     */
    registerScreenAction(name, fn) {
        this._screenActions.set(name, fn);
        logger.debug(`ScreenAction enregistrée : "${name}"`);
    }

    unregisterScreenAction(name) {
        this._screenActions.delete(name);
    }

    // ---------------------------------------------------------------- //
    //  Traitement principal
    // ---------------------------------------------------------------- //

    async _handleFeedbacks(bindingId, keyType, keyId) {
        const feedbacks = this.repo.getFeedbacksForBinding(bindingId);
        if (!feedbacks.length) return;

        for (const feedback of feedbacks) {
            try {
                await this._executeFeedback(feedback, keyType, keyId);
            } catch (err) {
                logger.warn(`Feedback id=${feedback.id} (${feedback.type}) échoué : ${err.message}`);
            }
        }
    }

    async _executeFeedback(feedback, sourceType, sourceKeyId) {
        // Résolution des params : cases → sélection du bon bloc, puis templates
        let params;
        if (feedback.params?.cases) {
            const state   = this.stateStore?.getAll() ?? {};
            let matched   = null;
            for (const c of feedback.params.cases) {
                if (c.else)                             { matched = c.params; break; }
                if (this._evalCondition(c.when, state)) { matched = c.params; break; }
            }
            if (!matched) return; // aucun cas ne correspond
            params = this._resolveParams(matched);
        } else {
            params = this._resolveParams(feedback.params ?? {});
        }

        const keyType = params.target_source_type ?? sourceType;
        const keyId   = params.target_key_id      ?? sourceKeyId;

        switch (feedback.type) {

            case 'haptic':
                await this._executeHaptic(params);
                break;

            case 'led':
                await this._executeLed(params, keyType, keyId);
                break;

            case 'draw':
                await this._executeDraw(params, keyType, keyId);
                break;

            case 'screen':
                await this._executeScreen(params);
                break;

            default:
                logger.warn(`FeedbackManager : type inconnu "${feedback.type}"`);
        }
    }

    // ---------------------------------------------------------------- //
    //  Haptic
    // ---------------------------------------------------------------- //

    async _executeHaptic({ pattern = 'SHORT_LOW' }) {
        const code = HAPTIC[pattern] ?? HAPTIC.SHORT_LOW;
        try {
            await this.device.vibrate(code);
            logger.debug(`Haptic : ${pattern} (0x${code.toString(16)})`);
        } catch (err) {
            logger.warn(`Haptic échoué : ${err.message}`);
        }
    }

    // ---------------------------------------------------------------- //
    //  LED (boutons physiques seulement)
    // ---------------------------------------------------------------- //

    async _executeLed({ color = '#FFFFFF' }, keyType, keyId) {
        if (keyType !== 'buttons') {
            logger.warn(`LED ignoré : keyType="${keyType}" ne supporte pas les LEDs.`);
            return;
        }
        // Les boutons physiques numérotés sont 0-7
        const numericId = parseInt(keyId, 10);
        if (isNaN(numericId)) {
            logger.warn(`LED ignoré : keyId="${keyId}" n'est pas un bouton numéroté.`);
            return;
        }
        await this.device.setButtonColor({ id: numericId, color });
        logger.debug(`LED bouton ${numericId} → ${color}`);
    }

    // ---------------------------------------------------------------- //
    //  Draw (touches tactiles seulement)
    // ---------------------------------------------------------------- //

    async _executeDraw(params, keyType, keyId) {
        if (keyType !== 'touch') {
            logger.warn(`Draw ignoré : keyType="${keyType}" ne supporte pas le draw.`);
            return;
        }
        const numericKey = parseInt(keyId, 10);
        if (isNaN(numericKey)) {
            logger.warn(`Draw ignoré : keyId="${keyId}" invalide.`);
            return;
        }

        const rendererName = params.renderer ?? 'fill';
        const renderer = this.renderers[rendererName];

        if (!renderer) {
            logger.warn(`Draw : renderer inconnu "${rendererName}"`);
            return;
        }

        await renderer.draw(numericKey, params);
        logger.debug(`Draw touch ${numericKey} → renderer="${rendererName}"`);
    }

    // ---------------------------------------------------------------- //
    //  Screen (drawCanvas — zone centrale complète)
    // ---------------------------------------------------------------- //

    async _executeScreen({ scene }) {
        if (!scene) { logger.warn('Screen : paramètre "scene" manquant'); return; }
        const fn = this._screenActions.get(scene);
        if (!fn) { logger.warn(`Screen : scène "${scene}" non enregistrée`); return; }
        await fn(this.device, { scene });
        logger.debug(`Screen : scène "${scene}" exécutée`);
    }

    // ---------------------------------------------------------------- //
    //  API publique : déclencher manuellement un feedback
    // ---------------------------------------------------------------- //

    /**
     * Déclenche tous les feedbacks d'un binding.
     * Appelé par Uwudeck après l'exécution d'une action.
     */
    trigger(bindingId, keyType, keyId) {
        return this._handleFeedbacks(bindingId, keyType, keyId);
    }

    /**
     * Redessine les feedbacks visuels (draw/led/screen) d'un binding
     * sans déclencher les feedbacks non-visuels (haptic).
     * Appelé lorsqu'une variable d'état change.
     */
    async refresh(bindingId, keyType, keyId) {
        const feedbacks = this.repo.getFeedbacksForBinding(bindingId);
        for (const feedback of feedbacks) {
            if (feedback.type === 'haptic') continue;
            try {
                await this._executeFeedback(feedback, keyType, keyId);
            } catch (err) {
                logger.warn(`Feedback refresh id=${feedback.id} (${feedback.type}) échoué : ${err.message}`);
            }
        }
    }

    // ---------------------------------------------------------------- //
    //  Résolution des templates et conditions
    // ---------------------------------------------------------------- //

    /**
     * Remplace les {{expr}} dans les valeurs string des params
     * avec les variables d'état courantes.
     */
    _resolveParams(params) {
        if (!params || typeof params !== 'object') return params ?? {};
        const state = this.stateStore?.getAll() ?? {};
        const out   = {};
        for (const [key, val] of Object.entries(params)) {
            if (typeof val === 'string' && val.includes('{{')) {
                out[key] = this._evalTemplate(val, state);
            } else {
                out[key] = val;
            }
        }
        return out;
    }

    _evalTemplate(template, state) {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
            try {
                // eslint-disable-next-line no-new-func
                const fn = new Function(...Object.keys(state), `return (${expr.trim()})`);
                return String(fn(...Object.values(state)));
            } catch {
                return '';
            }
        });
    }

    _evalCondition(expr, state) {
        try {
            // eslint-disable-next-line no-new-func
            const fn = new Function(...Object.keys(state), `return !!(${expr})`);
            return fn(...Object.values(state));
        } catch {
            return false;
        }
    }
}