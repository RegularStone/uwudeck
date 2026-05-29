// src/web/api/routes.js
import { Router }            from 'express';
import { ProfileRepository } from '../../db/ProfileRepository.js';
import { getDb }             from '../../db/Database.js';
import { logger }            from '../../utils/logger.js';

/**
 * @param {object}   uwudeck   - Instance Uwudeck (accès device + feedbackManager)
 * @param {Function} broadcast - (event) => void
 */
export function createRoutes(uwudeck, broadcast) {
    const router = Router();
    const repo   = new ProfileRepository();

    // GET /api/profile
    router.get('/profile', (req, res) => {
        try {
            const profile = repo.getActiveProfile();
            if (!profile) return res.status(404).json({ error: 'Aucun profil actif' });
            const pages = repo.getPagesForProfile(profile.id);
            res.json({ ...profile, pages });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // GET /api/pages/:pageId/bindings  (pageId = 'global' ou entier)
    router.get('/pages/:pageId/bindings', (req, res) => {
        try {
            const profile = repo.getActiveProfile();
            const pageId  = req.params.pageId === 'global' ? null : parseInt(req.params.pageId);

            const rows = getDb().prepare(`
                SELECT b.*,
                       json_group_array(
                           json_object('id', f.id, 'type', f.type, 'params', f.params)
                       ) FILTER (WHERE f.id IS NOT NULL) AS feedbacks_json
                FROM bindings b
                LEFT JOIN feedbacks f ON f.binding_id = b.id
                WHERE b.profile_id = ? AND b.page_id IS ?
                GROUP BY b.id
            `).all(profile.id, pageId);

            const bindings = rows.map(row => ({
                ...row,
                args:      JSON.parse(row.args),
                feedbacks: JSON.parse(row.feedbacks_json || '[]').map(f => ({
                    ...f,
                    params: typeof f.params === 'string' ? JSON.parse(f.params) : f.params,
                })),
            }));
            res.json(bindings);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // GET /api/bindings/:id
    router.get('/bindings/:id', (req, res) => {
        try {
            const binding = repo.getBindingById(parseInt(req.params.id));
            if (!binding) return res.status(404).json({ error: 'Binding introuvable' });
            res.json({ ...binding, feedbacks: repo.getFeedbacksForBinding(binding.id) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // POST /api/bindings  (upsert)
    router.post('/bindings', (req, res) => {
        try {
            const { pageId = null, sourceType, keyId, action, args = {} } = req.body;
            const profile = repo.getActiveProfile();
            if (!sourceType || keyId === undefined || !action)
                return res.status(400).json({ error: 'sourceType, keyId, action requis' });

            const binding = repo.createBinding({ profileId: profile.id, pageId, sourceType, keyId: String(keyId), action, args });
            broadcast({ type: 'binding:updated', binding });
            logger.info(`Binding upsert : ${sourceType}[${keyId}] → ${action}`);
            res.json(binding);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // PUT /api/bindings/:id
    router.put('/bindings/:id', (req, res) => {
        try {
            const { action, args } = req.body;
            const existing = repo.getBindingById(parseInt(req.params.id));
            if (!existing) return res.status(404).json({ error: 'Binding introuvable' });

            const updated = repo.createBinding({
                profileId: existing.profile_id, pageId: existing.page_id,
                sourceType: existing.source_type, keyId: existing.key_id,
                action: action ?? existing.action, args: args ?? existing.args,
            });
            broadcast({ type: 'binding:updated', binding: updated });
            res.json(updated);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // DELETE /api/bindings/:id
    router.delete('/bindings/:id', (req, res) => {
        try {
            if (!repo.getBindingById(parseInt(req.params.id)))
                return res.status(404).json({ error: 'Binding introuvable' });
            getDb().prepare('DELETE FROM bindings WHERE id = ?').run(parseInt(req.params.id));
            broadcast({ type: 'binding:deleted', bindingId: parseInt(req.params.id) });
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // GET /api/feedbacks?bindingId=X
    router.get('/feedbacks', (req, res) => {
        try {
            const bindingId = parseInt(req.query.bindingId);
            if (isNaN(bindingId)) return res.status(400).json({ error: 'bindingId requis' });
            res.json(repo.getFeedbacksForBinding(bindingId));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // POST /api/feedbacks
    router.post('/feedbacks', (req, res) => {
        try {
            const { bindingId, type, params = {} } = req.body;
            if (!bindingId || !type) return res.status(400).json({ error: 'bindingId et type requis' });
            const binding = repo.getBindingById(parseInt(bindingId));
            if (!binding) return res.status(404).json({ error: 'Binding introuvable' });

            const feedback = repo.addFeedback(binding.id, type, params);
            broadcast({ type: 'feedback:updated', bindingId: binding.id, feedback });
            applyFeedbackLive(feedback, binding, uwudeck);
            res.json(feedback);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // PUT /api/feedbacks/:id
    router.put('/feedbacks/:id', (req, res) => {
        try {
            const { params } = req.body;
            const existing = repo.getFeedbackById(parseInt(req.params.id));
            if (!existing) return res.status(404).json({ error: 'Feedback introuvable' });

            getDb().prepare('UPDATE feedbacks SET params = ? WHERE id = ?')
                .run(JSON.stringify(params ?? existing.params), existing.id);

            const updated = repo.getFeedbackById(existing.id);
            const binding = repo.getBindingById(updated.binding_id);
            broadcast({ type: 'feedback:updated', bindingId: updated.binding_id, feedback: updated });
            applyFeedbackLive(updated, binding, uwudeck);
            res.json(updated);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // DELETE /api/feedbacks/:id
    router.delete('/feedbacks/:id', (req, res) => {
        try {
            const feedbackId = parseInt(req.params.id);
            const feedback   = repo.getFeedbackById(feedbackId);
            if (!feedback) return res.status(404).json({ error: 'Feedback introuvable' });

            const binding = repo.getBindingById(feedback.binding_id);
            repo.deleteFeedback(feedbackId);
            broadcast({ type: 'feedback:deleted', feedbackId });

            // Si c'était un feedback visuel (draw), reset la touche en noir
            if (feedback.type === 'draw' && binding) {
                const targetSourceType = feedback.params?.target_source_type ?? binding.source_type;
                const targetKeyId      = feedback.params?.target_key_id      ?? binding.key_id;
                applyFeedbackLive(
                    { id: -1, binding_id: -1, type: 'draw', params: { renderer: 'fill', color: '#000000' } },
                    { source_type: targetSourceType, key_id: targetKeyId },
                    uwudeck
                );
            }

            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // PUT /api/feedbacks/binding/:bindingId  — remplace tout d'un coup
    router.put('/feedbacks/binding/:bindingId', (req, res) => {
        try {
            const bindingId = parseInt(req.params.bindingId);
            const { feedbacks } = req.body;
            if (!Array.isArray(feedbacks)) return res.status(400).json({ error: 'feedbacks doit être un tableau' });

            repo.replaceFeedbacks(bindingId, feedbacks);
            const updated = repo.getFeedbacksForBinding(bindingId);
            const binding = repo.getBindingById(bindingId);
            broadcast({ type: 'feedbacks:replaced', bindingId, feedbacks: updated });
            for (const fb of updated) applyFeedbackLive(fb, binding, uwudeck);
            res.json(updated);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // POST /api/preview  — applique un feedback live sans sauvegarder
    router.post('/preview', (req, res) => {
        try {
            const { sourceType = 'touch', keyId = '0', type, params = {} } = req.body;
            applyFeedbackLive(
                { id: -1, binding_id: -1, type, params },
                { source_type: sourceType, key_id: String(keyId) },
                uwudeck
            );
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ---------------------------------------------------------------- //
    //  Gestion des profils
    // ---------------------------------------------------------------- //

    // GET /api/profiles  — liste tous les profils avec leurs pages
    router.get('/profiles', (req, res) => {
        try {
            const profiles = repo.listProfiles().map(p => ({
                ...p,
                pages: repo.getPagesForProfile(p.id),
            }));
            res.json(profiles);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // POST /api/profiles  — créer un profil
    router.post('/profiles', (req, res) => {
        try {
            const { name } = req.body;
            if (!name?.trim()) return res.status(400).json({ error: 'name requis' });
            const profile = repo.createProfile(name.trim());
            broadcast({ type: 'profiles:changed' });
            res.json(profile);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // PUT /api/profiles/:id  — renommer ou activer
    router.put('/profiles/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (!repo.getProfileById(id)) return res.status(404).json({ error: 'Profil introuvable' });
            const { name, active } = req.body;
            if (name !== undefined) repo.updateProfileName(id, name.trim());
            if (active === true)    repo.setActiveProfile(id);
            broadcast({ type: 'profiles:changed' });
            res.json(repo.getProfileById(id));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // DELETE /api/profiles/:id
    router.delete('/profiles/:id', (req, res) => {
        try {
            const id      = parseInt(req.params.id);
            const profile = repo.getProfileById(id);
            if (!profile) return res.status(404).json({ error: 'Profil introuvable' });
            if (profile.active) return res.status(400).json({ error: 'Impossible de supprimer le profil actif' });
            repo.deleteProfile(id);
            broadcast({ type: 'profiles:changed' });
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ---------------------------------------------------------------- //
    //  Gestion des pages
    // ---------------------------------------------------------------- //

    // POST /api/profiles/:id/pages  — ajouter une page
    router.post('/profiles/:id/pages', (req, res) => {
        try {
            const profileId = parseInt(req.params.id);
            if (!repo.getProfileById(profileId)) return res.status(404).json({ error: 'Profil introuvable' });
            const { name } = req.body;
            if (!name?.trim()) return res.status(400).json({ error: 'name requis' });
            const pages = repo.getPagesForProfile(profileId);
            const page  = repo.createPage(profileId, name.trim(), pages.length);
            broadcast({ type: 'profiles:changed' });
            res.json(page);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // PUT /api/pages/:id  — renommer une page
    router.put('/pages/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (!repo.getPageById(id)) return res.status(404).json({ error: 'Page introuvable' });
            const { name } = req.body;
            if (!name?.trim()) return res.status(400).json({ error: 'name requis' });
            repo.updatePageName(id, name.trim());
            broadcast({ type: 'profiles:changed' });
            res.json(repo.getPageById(id));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // DELETE /api/pages/:id
    router.delete('/pages/:id', (req, res) => {
        try {
            const id   = parseInt(req.params.id);
            const page = repo.getPageById(id);
            if (!page) return res.status(404).json({ error: 'Page introuvable' });
            // Vérifier qu'il reste au moins une page dans le profil
            const pages = repo.getPagesForProfile(page.profile_id);
            if (pages.length <= 1) return res.status(400).json({ error: 'Un profil doit avoir au moins une page' });
            repo.deletePage(id);
            broadcast({ type: 'profiles:changed' });
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // GET /api/actions
    router.get('/actions', (_req, res) => {
        res.json([
            { name: 'VOLUME_SYSTEM_ROTATE', args: [],         argTypes: {},                              sourceTypes: ['knobs'] },
            { name: 'VOLUME_APP_ROTATE',    args: ['target'], argTypes: {},                              sourceTypes: ['knobs'] },
            { name: 'MUTE_SYSTEM_TOGGLE',   args: [],         argTypes: {},                              sourceTypes: ['buttons', 'touch'] },
            { name: 'MUTE_APP_TOGGLE',      args: ['target'], argTypes: {},                              sourceTypes: ['buttons', 'touch'] },
            { name: 'SWITCH_AUDIO_OUTPUT',  args: ['device'], argTypes: { device: 'audio-device-output' }, sourceTypes: ['buttons', 'touch'] },
            { name: 'SWITCH_AUDIO_INPUT',   args: ['device'], argTypes: { device: 'audio-device-input'  }, sourceTypes: ['buttons', 'touch'] },
            { name: 'NEXT_PAGE',            args: [],         argTypes: {},                              sourceTypes: ['buttons', 'touch'] },
            { name: 'PREVIOUS_PAGE',        args: [],         argTypes: {},                              sourceTypes: ['buttons', 'touch'] },
            { name: 'OPEN_PATH',            args: ['path'],   argTypes: {},                              sourceTypes: ['buttons', 'touch'] },
        ]);
    });

    // GET /api/audio-devices — liste les périphériques audio actifs
    router.get('/audio-devices', async (_req, res) => {
        try {
            const audio = uwudeck?.currentProfile?.registry?.audio;
            if (!audio) return res.status(503).json({ error: 'AudioActions non disponible' });
            res.json(await audio.getAudioDevices());
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // GET /api/statebar-resolvers — value_action disponibles pour le renderer statebar
    router.get('/statebar-resolvers', (_req, res) => {
        res.json([
            { value_action: 'GET_VOLUME_SYSTEM',      description: 'Volume du périphérique audio par défaut (0–100%)' },
            { value_action: 'GET_VOLUME_APP:<app>',   description: 'Volume d\'une application — remplace <app> par le nom du .exe, ex: GET_VOLUME_APP:chrome.exe' },
        ]);
    });

    // ---------------------------------------------------------------- //
    //  Variables d'état
    // ---------------------------------------------------------------- //

    // GET /api/variables — liste les définitions
    router.get('/variables', (_req, res) => {
        try { res.json(repo.listVariables()); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // GET /api/variables/state — valeurs runtime courantes
    router.get('/variables/state', (req, res) => {
        try { res.json(uwudeck.stateStore?.getAll() ?? {}); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // POST /api/variables — créer une variable
    router.post('/variables', (req, res) => {
        try {
            const { name, type = 'boolean', defaultValue = null, persistValue = false, description = '', group = null } = req.body;
            if (!name?.trim()) return res.status(400).json({ error: 'name requis' });
            const variable = repo.createVariable({ name: name.trim(), type, defaultValue, persistValue, description, group: group?.trim() || null });
            uwudeck.stateStore?.reload();
            broadcast({ type: 'variables:changed' });
            res.json(variable);
        } catch (e) {
            if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: `Variable "${req.body.name}" existe déjà` });
            res.status(500).json({ error: e.message });
        }
    });

    // PUT /api/variables/:id — modifier une variable
    router.put('/variables/:id', (req, res) => {
        try {
            const id       = parseInt(req.params.id);
            const variable = repo.updateVariable(id, req.body);
            if (!variable) return res.status(404).json({ error: 'Variable introuvable' });
            uwudeck.stateStore?.reload();
            broadcast({ type: 'variables:changed' });
            res.json(variable);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // DELETE /api/variables/:id
    router.delete('/variables/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (!repo.getVariableById(id)) return res.status(404).json({ error: 'Variable introuvable' });
            repo.deleteVariable(id);
            uwudeck.stateStore?.reload();
            broadcast({ type: 'variables:changed' });
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // POST /api/variables/state — forcer une valeur runtime (test depuis l'UI)
    router.post('/variables/state', (req, res) => {
        try {
            const { name, value } = req.body;
            if (!name) return res.status(400).json({ error: 'name requis' });
            if (!uwudeck.stateStore) return res.status(503).json({ error: 'StateStore non initialisé' });
            uwudeck.stateStore.set(name, value);
            uwudeck._refreshVisibleFeedbacks();
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
}

function applyFeedbackLive(feedback, binding, uwudeck) {
    if (!uwudeck?.feedbackManager || !uwudeck?.device) return;
    uwudeck.feedbackManager
        ._executeFeedback(feedback, binding.source_type, binding.key_id)
        .catch(err => logger.warn(`Live feedback échoué : ${err.message}`));
}