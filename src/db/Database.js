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