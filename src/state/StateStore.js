// src/state/StateStore.js
import { EventEmitter } from 'events';
import { getDb } from '../db/Database.js';
import { logger } from '../utils/logger.js';

/**
 * StateStore — variables d'état runtime.
 *
 * Les définitions (nom, type, valeur par défaut) sont persistées en BDD.
 * Les valeurs courantes vivent en mémoire et sont réinitialisées au démarrage,
 * sauf si persist_value = 1 (la dernière valeur connue est restaurée).
 *
 * Émet 'change' (name, value) à chaque set().
 */
export class StateStore extends EventEmitter {

    constructor() {
        super();
        this._state = {};
        this._load();
    }

    // ---------------------------------------------------------------- //
    //  Chargement depuis la BDD
    // ---------------------------------------------------------------- //

    _load() {
        const rows = getDb().prepare('SELECT * FROM variables').all();
        for (const row of rows) {
            const useLastValue = row.persist_value && row.last_value !== null;
            const raw          = useLastValue ? row.last_value : row.default_value;
            this._state[row.name] = raw !== null ? JSON.parse(raw) : null;
        }
        logger.debug(`StateStore : ${Object.keys(this._state).length} variable(s) chargée(s)`);
    }

    /**
     * Recharge depuis la BDD (après création/suppression d'une variable).
     * Les valeurs des variables existantes sont préservées en mémoire.
     */
    reload() {
        const previous = { ...this._state };
        this._state = {};
        this._load();
        // Restaure les valeurs runtime des variables qui existaient déjà
        for (const name of Object.keys(this._state)) {
            if (Object.prototype.hasOwnProperty.call(previous, name)) {
                this._state[name] = previous[name];
            }
        }
    }

    // ---------------------------------------------------------------- //
    //  API publique
    // ---------------------------------------------------------------- //

    get(name) {
        return this._state[name] ?? null;
    }

    set(name, value) {
        if (!Object.prototype.hasOwnProperty.call(this._state, name)) {
            logger.warn(`StateStore.set : variable inconnue "${name}"`);
        }
        this._state[name] = value;

        // Persister si la variable a persist_value = 1
        try {
            const row = getDb()
                .prepare('SELECT persist_value FROM variables WHERE name = ?')
                .get(name);
            if (row?.persist_value) {
                getDb()
                    .prepare('UPDATE variables SET last_value = ? WHERE name = ?')
                    .run(JSON.stringify(value), name);
            }
        } catch (err) {
            logger.warn(`StateStore : impossible de persister "${name}" : ${err.message}`);
        }

        this.emit('change', name, value);
        logger.debug(`StateStore : ${name} = ${JSON.stringify(value)}`);
    }

    getAll() {
        return { ...this._state };
    }
}
