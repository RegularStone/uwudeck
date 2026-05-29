// src/db/ProfileRepository.js
import { getDb } from './Database.js';

/**
 * Couche d'accès aux données pour les profils, pages, bindings et feedbacks.
 * Toutes les méthodes sont synchrones (better-sqlite3).
 */
export class ProfileRepository {

    // ------------------------------------------------------------------ //
    //  PROFILS
    // ------------------------------------------------------------------ //

    /**
     * Crée un nouveau profil. Retourne l'objet créé avec son id.
     */
    createProfile(name) {
        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO profiles (name) VALUES (?)
        `);
        const result = stmt.run(name);
        return this.getProfileById(result.lastInsertRowid);
    }

    getProfileById(id) {
        return getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    }

    getProfileByName(name) {
        return getDb().prepare('SELECT * FROM profiles WHERE name = ?').get(name);
    }

    getActiveProfile() {
        return getDb().prepare('SELECT * FROM profiles WHERE active = 1').get();
    }

    /**
     * Définit un profil comme actif (désactive tous les autres).
     */
    setActiveProfile(profileId) {
        const db = getDb();
        db.transaction(() => {
            db.prepare('UPDATE profiles SET active = 0').run();
            db.prepare('UPDATE profiles SET active = 1 WHERE id = ?').run(profileId);
        })();
    }

    listProfiles() {
        return getDb().prepare('SELECT * FROM profiles ORDER BY id').all();
    }

    deleteProfile(profileId) {
        getDb().prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
    }

    updateProfileName(id, name) {
        getDb().prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, id);
    }

    // ------------------------------------------------------------------ //
    //  PAGES
    // ------------------------------------------------------------------ //

    createPage(profileId, name, order = 0) {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO pages (profile_id, name, page_order) VALUES (?, ?, ?)
        `).run(profileId, name, order);
        return this.getPageById(result.lastInsertRowid);
    }

    getPageById(id) {
        return getDb().prepare('SELECT * FROM pages WHERE id = ?').get(id);
    }

    getPagesForProfile(profileId) {
        return getDb().prepare(`
            SELECT * FROM pages WHERE profile_id = ? ORDER BY page_order ASC
        `).all(profileId);
    }

    updatePageName(id, name) {
        getDb().prepare('UPDATE pages SET name = ? WHERE id = ?').run(name, id);
    }

    deletePage(id) {
        getDb().prepare('DELETE FROM pages WHERE id = ?').run(id);
    }

    // ------------------------------------------------------------------ //
    //  BINDINGS
    // ------------------------------------------------------------------ //

    /**
     * Crée un binding.
     * @param {object} opts
     * @param {number}      opts.profileId
     * @param {number|null} opts.pageId     - null = global
     * @param {string}      opts.sourceType - 'buttons' | 'knobs' | 'touch'
     * @param {string}      opts.keyId      - ex: 'knobTL', '0', '14'
     * @param {string}      opts.action     - ex: 'VOLUME_SYSTEM_ROTATE'
     * @param {object}      [opts.args]     - ex: { target: 'opera.exe' }
     */
    createBinding({ profileId, pageId = null, sourceType, keyId, action, args = {} }) {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO bindings (profile_id, page_id, source_type, key_id, action, args)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(profile_id, page_id, source_type, key_id)
            DO UPDATE SET action = excluded.action, args = excluded.args
        `).run(profileId, pageId, sourceType, String(keyId), action, JSON.stringify(args));
        return this.getBindingById(result.lastInsertRowid || this._getBindingId(profileId, pageId, sourceType, keyId));
    }

    _getBindingId(profileId, pageId, sourceType, keyId) {
        const row = getDb().prepare(`
            SELECT id FROM bindings
            WHERE profile_id = ? AND page_id IS ? AND source_type = ? AND key_id = ?
        `).get(profileId, pageId, sourceType, String(keyId));
        return row?.id;
    }

    getBindingById(id) {
        const row = getDb().prepare('SELECT * FROM bindings WHERE id = ?').get(id);
        if (!row) return null;
        return { ...row, args: JSON.parse(row.args) };
    }

    /**
     * Résout le binding actif pour une clé donnée.
     * Priorité : binding de page > binding global.
     * @param {number}      profileId
     * @param {number|null} pageId
     * @param {string}      sourceType
     * @param {string}      keyId
     */
    /**
     * Retourne tous les bindings actifs pour une page donnée
     * (bindings de page + bindings globaux non écrasés par la page).
     * @returns {Array<{id, source_type, key_id}>}
     */
    getActiveBindingsForPage(profileId, pageId) {
        const db = getDb();
        const pageBindings = db.prepare(`
            SELECT id, source_type, key_id FROM bindings
            WHERE profile_id = ? AND page_id = ?
        `).all(profileId, pageId);

        const pageKeys = new Set(pageBindings.map(b => `${b.source_type}:${b.key_id}`));

        const globalBindings = db.prepare(`
            SELECT id, source_type, key_id FROM bindings
            WHERE profile_id = ? AND page_id IS NULL
        `).all(profileId).filter(b => !pageKeys.has(`${b.source_type}:${b.key_id}`));

        return [...pageBindings, ...globalBindings];
    }

    resolveBinding(profileId, pageId, sourceType, keyId) {
        const db = getDb();

        // 1. Binding spécifique à la page
        const pageBinding = db.prepare(`
            SELECT * FROM bindings
            WHERE profile_id = ? AND page_id = ? AND source_type = ? AND key_id = ?
        `).get(profileId, pageId, sourceType, String(keyId));

        if (pageBinding) return { ...pageBinding, args: JSON.parse(pageBinding.args) };

        // 2. Fallback sur le binding global (page_id IS NULL)
        const globalBinding = db.prepare(`
            SELECT * FROM bindings
            WHERE profile_id = ? AND page_id IS NULL AND source_type = ? AND key_id = ?
        `).get(profileId, sourceType, String(keyId));

        if (globalBinding) return { ...globalBinding, args: JSON.parse(globalBinding.args) };

        return null;
    }

    // ------------------------------------------------------------------ //
    //  FEEDBACKS
    // ------------------------------------------------------------------ //

    /**
     * Ajoute un feedback à un binding.
     * @param {number} bindingId
     * @param {string} type   - 'haptic' | 'led' | 'draw'
     * @param {object} params - objet sérialisé en JSON
     */
    addFeedback(bindingId, type, params = {}) {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO feedbacks (binding_id, type, params) VALUES (?, ?, ?)
        `).run(bindingId, type, JSON.stringify(params));
        return this.getFeedbackById(result.lastInsertRowid);
    }

    getFeedbackById(id) {
        const row = getDb().prepare('SELECT * FROM feedbacks WHERE id = ?').get(id);
        if (!row) return null;
        return { ...row, params: JSON.parse(row.params) };
    }

    /**
     * Récupère tous les feedbacks d'un binding, params déjà désérialisés.
     */
    getFeedbacksForBinding(bindingId) {
        return getDb().prepare(`
            SELECT * FROM feedbacks WHERE binding_id = ?
        `).all(bindingId).map(row => ({ ...row, params: JSON.parse(row.params) }));
    }

    deleteFeedback(feedbackId) {
        getDb().prepare('DELETE FROM feedbacks WHERE id = ?').run(feedbackId);
    }

    /**
     * Remplace tous les feedbacks d'un binding (utile pour l'édition UI).
     */
    replaceFeedbacks(bindingId, feedbackList) {
        const db = getDb();
        db.transaction(() => {
            db.prepare('DELETE FROM feedbacks WHERE binding_id = ?').run(bindingId);
            for (const { type, params } of feedbackList) {
                db.prepare(`
                    INSERT INTO feedbacks (binding_id, type, params) VALUES (?, ?, ?)
                `).run(bindingId, type, JSON.stringify(params));
            }
        })();
    }

    // ------------------------------------------------------------------ //
    //  VARIABLES D'ÉTAT
    // ------------------------------------------------------------------ //

    createVariable({ name, type = 'boolean', defaultValue = null, persistValue = false, description = '', group = null }) {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO variables (name, type, default_value, persist_value, description, group_name)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            name,
            type,
            defaultValue !== null ? JSON.stringify(defaultValue) : null,
            persistValue ? 1 : 0,
            description,
            group || null,
        );
        return this.getVariableById(result.lastInsertRowid);
    }

    getVariableById(id) {
        const row = getDb().prepare('SELECT * FROM variables WHERE id = ?').get(id);
        return row ? this._parseVariable(row) : null;
    }

    listVariables() {
        return getDb().prepare('SELECT * FROM variables ORDER BY group_name ASC NULLS LAST, name ASC').all()
            .map(r => this._parseVariable(r));
    }

    updateVariable(id, updates) {
        const db  = getDb();
        const row = db.prepare('SELECT * FROM variables WHERE id = ?').get(id);
        if (!row) return null;

        const name         = updates.name        ?? row.name;
        const type         = updates.type        ?? row.type;
        const description  = updates.description ?? row.description;
        const persistValue = updates.hasOwnProperty('persistValue')
            ? (updates.persistValue ? 1 : 0)
            : row.persist_value;
        const defaultValue = updates.hasOwnProperty('defaultValue')
            ? (updates.defaultValue !== null ? JSON.stringify(updates.defaultValue) : null)
            : row.default_value;
        const groupName = updates.hasOwnProperty('group')
            ? (updates.group || null)
            : row.group_name;

        db.prepare(`
            UPDATE variables
            SET name = ?, type = ?, default_value = ?, persist_value = ?, description = ?, group_name = ?
            WHERE id = ?
        `).run(name, type, defaultValue, persistValue, description, groupName, id);

        return this.getVariableById(id);
    }

    deleteVariable(id) {
        getDb().prepare('DELETE FROM variables WHERE id = ?').run(id);
    }

    _parseVariable(row) {
        return {
            ...row,
            default_value: row.default_value !== null ? JSON.parse(row.default_value) : null,
            last_value:    row.last_value    !== null ? JSON.parse(row.last_value)    : null,
            persist_value: Boolean(row.persist_value),
            group:         row.group_name ?? null,
        };
    }

    // ------------------------------------------------------------------ //
    //  SNAPSHOT COMPLET (pour chargement initial du profil actif)
    // ------------------------------------------------------------------ //

    /**
     * Charge toutes les pages + bindings + feedbacks du profil actif en une seule passe.
     * Retourne un objet structuré prêt à l'emploi par ActiveProfile.
     */
    loadActiveProfileSnapshot() {
        const profile = this.getActiveProfile();
        if (!profile) return null;

        const pages = this.getPagesForProfile(profile.id);

        const bindings = getDb().prepare(`
            SELECT b.*, GROUP_CONCAT(f.id) as feedback_ids
            FROM bindings b
            LEFT JOIN feedbacks f ON f.binding_id = b.id
            WHERE b.profile_id = ?
            GROUP BY b.id
        `).all(profile.id).map(row => ({
            ...row,
            args: JSON.parse(row.args),
        }));

        const feedbacks = getDb().prepare(`
            SELECT f.* FROM feedbacks f
            INNER JOIN bindings b ON b.id = f.binding_id
            WHERE b.profile_id = ?
        `).all(profile.id).map(row => ({
            ...row,
            params: JSON.parse(row.params),
        }));

        return { profile, pages, bindings, feedbacks };
    }
}