// src/db/migrate.js
// Lance ce script UNE FOIS pour importer ton profile_template.json dans SQLite.
// Usage : node src/db/migrate.js
// Usage (chemin custom) : node src/db/migrate.js ./src/configs/mon_profil.json

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { getDb, closeDb } from './Database.js';
import { ProfileRepository } from './ProfileRepository.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSON = join(__dirname, '..', 'configs', 'profile_template.json');

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

/**
 * Normalise une valeur de binding JSON (string ou objet) en { action, args }.
 */
function normalizeActionData(value) {
    if (!value) return null;
    if (typeof value === 'string') return { action: value, args: {} };
    if (typeof value === 'object' && value.action) {
        const { action, ...args } = value;
        return { action, args };
    }
    return null;
}

// ------------------------------------------------------------------ //
//  Migration principale
// ------------------------------------------------------------------ //

async function migrate(jsonPath = DEFAULT_JSON) {
    const absPath = resolve(jsonPath);

    if (!existsSync(absPath)) {
        logger.error(`Fichier JSON introuvable : ${absPath}`);
        process.exit(1);
    }

    logger.info(`Migration depuis : ${absPath}`);

    const json = JSON.parse(readFileSync(absPath, 'utf8'));
    const repo = new ProfileRepository();
    const db   = getDb();

    db.transaction(() => {

        // ---- 1. Profil -------------------------------------------- //
        let profile = repo.getProfileByName(json.profileName);
        if (profile) {
            logger.warn(`Profil "${json.profileName}" déjà présent — migration ignorée.`);
            logger.warn('Supprime la BDD (uwudeck.db) pour forcer une réimportation.');
            return;
        }

        profile = repo.createProfile(json.profileName);
        repo.setActiveProfile(profile.id);
        logger.info(`Profil créé : "${profile.name}" (id=${profile.id})`);

        // ---- 2. Pages --------------------------------------------- //
        const pageMap = {}; // pageKey → page row

        const pageKeys = Object.keys(json.pages);
        pageKeys.forEach((pageKey, index) => {
            const pageName = json.pages[pageKey].pageName || pageKey;
            const page = repo.createPage(profile.id, pageName, index);
            pageMap[pageKey] = page;
            logger.info(`  Page créée : "${page.name}" (order=${index}, id=${page.id})`);
        });

        // ---- 3. Bindings globaux ----------------------------------- //
        let globalBindingCount = 0;

        if (json.globalBindings) {
            for (const [sourceType, keys] of Object.entries(json.globalBindings)) {
                for (const [keyId, value] of Object.entries(keys)) {
                    const norm = normalizeActionData(value);
                    if (!norm) continue;

                    repo.createBinding({
                        profileId:  profile.id,
                        pageId:     null,     // global
                        sourceType,
                        keyId,
                        action:     norm.action,
                        args:       norm.args,
                    });
                    globalBindingCount++;
                }
            }
        }
        logger.info(`  ${globalBindingCount} binding(s) global(aux) importé(s)`);

        // ---- 4. Bindings par page ---------------------------------- //
        let pageBindingCount = 0;

        for (const [pageKey, pageData] of Object.entries(json.pages)) {
            const page = pageMap[pageKey];

            // On itère sur toutes les sourceTypes présentes dans la page
            // (on exclut 'pageName' qui n'est pas une sourceType)
            for (const [sourceType, keys] of Object.entries(pageData)) {
                if (sourceType === 'pageName') continue;
                if (typeof keys !== 'object' || keys === null) continue;

                for (const [keyId, value] of Object.entries(keys)) {
                    const norm = normalizeActionData(value);
                    if (!norm) continue;

                    repo.createBinding({
                        profileId:  profile.id,
                        pageId:     page.id,
                        sourceType,
                        keyId,
                        action:     norm.action,
                        args:       norm.args,
                    });
                    pageBindingCount++;
                }
            }
        }
        logger.info(`  ${pageBindingCount} binding(s) de page importé(s)`);

        // ---- 5. Feedbacks par défaut ------------------------------ //
        // On ajoute un feedback haptique SHORT_LOW sur tous les bindings
        // de type buttons/touch, et BUZZ sur les knobs — point de départ
        // que tu peux affiner via la future UI web.
        const allBindings = db.prepare(
            'SELECT * FROM bindings WHERE profile_id = ?'
        ).all(profile.id);

        let feedbackCount = 0;
        for (const binding of allBindings) {
            let hapticPattern;
            switch (binding.source_type) {
                case 'knobs':   hapticPattern = 'BUZZ';      break;
                case 'buttons': hapticPattern = 'SHORT_LOW'; break;
                case 'touch':   hapticPattern = 'SHORT_LOW'; break;
                default:        hapticPattern = 'SHORT_LOW';
            }

            repo.addFeedback(binding.id, 'haptic', { pattern: hapticPattern });
            feedbackCount++;
        }
        logger.info(`  ${feedbackCount} feedback(s) haptique(s) par défaut créé(s)`);

        logger.success(`✅ Migration terminée avec succès !`);

    })();

    closeDb();
}

// ------------------------------------------------------------------ //
//  Point d'entrée
// ------------------------------------------------------------------ //

const customPath = process.argv[2];
migrate(customPath).catch(err => {
    logger.error(`Erreur de migration : ${err.message}`);
    process.exit(1);
});