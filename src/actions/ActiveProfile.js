// src/actions/ActiveProfile.js
import { ProfileRepository } from '../db/ProfileRepository.js';
import { ActionRegistry }    from './ActionsRegistry.js';
import { logger }            from '../utils/logger.js';

/**
 * ActiveProfile
 * Remplace JsonProfile. Charge le profil actif depuis SQLite,
 * résout les bindings et retourne les actions + l'id du binding
 * (nécessaire pour que le FeedbackManager puisse déclencher les feedbacks).
 */
export class ActiveProfile {

    /**
     * @param {object} device - Instance Loupedeck
     */
    constructor(device) {
        this.device   = device;
        this.repo     = new ProfileRepository();
        this.registry = new ActionRegistry(device, this);

        // Chargement du snapshot depuis la BDD
        const snapshot = this.repo.loadActiveProfileSnapshot();
        if (!snapshot) {
            throw new Error('Aucun profil actif trouvé dans la base de données. Lance d\'abord node src/db/migrate.js');
        }

        this.profile = snapshot.profile;
        this.pages   = snapshot.pages;          // tableau ordonné par page_order

        this.currentPageIndex = 0;

        logger.info(`Profil actif : "${this.profile.name}" (${this.pages.length} page(s))`);
        logger.info(`Page active  : "${this.getCurrentPageName()}"`);
    }

    // ---------------------------------------------------------------- //
    //  Navigation entre pages
    // ---------------------------------------------------------------- //

    getCurrentPageName() {
        return this.pages[this.currentPageIndex]?.name ?? 'Inconnue';
    }

    getCurrentPageId() {
        return this.pages[this.currentPageIndex]?.id ?? null;
    }

    nextPage() {
        this.currentPageIndex = (this.currentPageIndex + 1) % this.pages.length;
        logger.info(`🔄 Passage au sous-profil : ${this.getCurrentPageName()}`);
    }

    previousPage() {
        this.currentPageIndex = (this.currentPageIndex - 1 + this.pages.length) % this.pages.length;
        logger.info(`🔄 Retour au sous-profil : ${this.getCurrentPageName()}`);
    }

    // ---------------------------------------------------------------- //
    //  Résolution d'une action + binding
    // ---------------------------------------------------------------- //

    /**
     * Retourne { action: Function, bindingId: number } ou null.
     *
     * L'appelant (Uwudeck) utilise bindingId pour déclencher les feedbacks
     * via FeedbackManager.trigger(bindingId, keyType, keyId).
     *
     * @param {string}      sourceType - 'buttons' | 'knobs' | 'touch'
     * @param {string|number} id       - identifiant de la clé
     * @returns {{ action: Function, bindingId: number } | null}
     */
    getAction(sourceType, id) {
        const binding = this.repo.resolveBinding(
            this.profile.id,
            this.getCurrentPageId(),
            sourceType,
            String(id),
        );

        if (!binding) return null;

        const baseAction = this.registry.get(binding.action);
        if (!baseAction) {
            logger.warn(`Action inconnue dans le registre : "${binding.action}"`);
            return null;
        }

        // Sépare les effets variables du reste des args (les actions ne les connaissent pas)
        const { _effects: effects = [], ...cleanArgs } = binding.args;

        const action = (hardwareDelta = null) => {
            return baseAction({
                delta: hardwareDelta,
                ...cleanArgs,
            });
        };

        return { action, bindingId: binding.id, effects };
    }

    /**
     * Retourne tous les bindings visibles sur la page courante.
     * @returns {Array<{bindingId: number, sourceType: string, keyId: string}>}
     */
    getVisibleBindings() {
        return this.repo
            .getActiveBindingsForPage(this.profile.id, this.getCurrentPageId())
            .map(b => ({ bindingId: b.id, sourceType: b.source_type, keyId: b.key_id }));
    }
}