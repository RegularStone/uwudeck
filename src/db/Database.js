// src/db/Database.js
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');
const DEFAULT_DB_PATH = join(process.cwd(), 'src', 'db', 'uwudeck.db');

let _instance = null;

/**
 * Retourne le singleton de la base de données.
 * Crée et initialise la BDD si elle n'existe pas encore.
 * @param {string} [dbPath] - Chemin optionnel vers le fichier .db (pour les tests)
 * @returns {import('better-sqlite3').Database}
 */
export function getDb(dbPath = DEFAULT_DB_PATH) {
    if (_instance) return _instance;

    _instance = new Database(dbPath);

    // Performances et intégrité
    _instance.pragma('journal_mode = WAL');
    _instance.pragma('foreign_keys = ON');

    // Initialisation du schéma (idempotent grâce aux IF NOT EXISTS)
    const schema = readFileSync(SCHEMA_PATH, 'utf8');
    _instance.exec(schema);

    // Migrations additives (idempotentes)
    try { _instance.exec('ALTER TABLE variables ADD COLUMN group_name TEXT DEFAULT NULL'); } catch { /* déjà présente */ }

    // Élargit le CHECK constraint de feedbacks.type pour inclure 'screen' et 'animation'
    const feedbacksType = _instance.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='feedbacks'`).get();
    if (feedbacksType && !feedbacksType.sql.includes("'screen'")) {
        _instance.exec(`
            PRAGMA foreign_keys = OFF;
            BEGIN;
            CREATE TABLE feedbacks_new (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                binding_id INTEGER NOT NULL REFERENCES bindings(id) ON DELETE CASCADE,
                type       TEXT    NOT NULL CHECK(type IN ('haptic', 'led', 'draw', 'screen', 'animation')),
                params     TEXT    NOT NULL DEFAULT '{}'
            );
            INSERT INTO feedbacks_new SELECT * FROM feedbacks;
            DROP TABLE feedbacks;
            ALTER TABLE feedbacks_new RENAME TO feedbacks;
            CREATE INDEX IF NOT EXISTS idx_feedbacks_binding ON feedbacks(binding_id);
            COMMIT;
            PRAGMA foreign_keys = ON;
        `);
    }

    // Screensaver settings
    _instance.exec(`
        CREATE TABLE IF NOT EXISTS screensaver_settings (
            id           INTEGER PRIMARY KEY CHECK (id = 1),
            enabled      INTEGER NOT NULL DEFAULT 1,
            animation_id TEXT    NOT NULL DEFAULT 'uwu_screen_01'
        )
    `);
    _instance.prepare(`INSERT OR IGNORE INTO screensaver_settings (id) VALUES (1)`).run();

    // Variable système : signets de fenêtres (map id→HWND, persistée entre sessions)
    _instance.prepare(`
        INSERT OR IGNORE INTO variables (name, type, default_value, persist_value, description)
        VALUES ('window_bookmarks', 'string', 'null', 1, 'Map JSON id→HWND des fenêtres en signet')
    `).run();

    logger.info(`Base de données initialisée : ${dbPath}`);
    return _instance;
}

/**
 * Ferme proprement la connexion (utile pour les tests ou l'arrêt).
 */
export function closeDb() {
    if (_instance) {
        _instance.close();
        _instance = null;
        logger.info('Base de données fermée.');
    }
}