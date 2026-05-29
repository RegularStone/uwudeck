-- ============================================================
-- uwudeck — schéma SQLite
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Profils
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    active      INTEGER NOT NULL DEFAULT 0,  -- booléen, 1 seul profil actif à la fois
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Pages d'un profil
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    page_order  INTEGER NOT NULL DEFAULT 0,  -- ordre d'affichage / navigation
    UNIQUE(profile_id, page_order)
);

-- ------------------------------------------------------------
-- Bindings : association clé → action
-- page_id NULL = binding global (toutes les pages du profil)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bindings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    page_id     INTEGER          REFERENCES pages(id)    ON DELETE CASCADE,  -- NULL = global
    source_type TEXT    NOT NULL CHECK(source_type IN ('buttons', 'knobs', 'touch')),
    key_id      TEXT    NOT NULL,  -- ex: "knobTL", "0", "14"
    action      TEXT    NOT NULL,  -- ex: "VOLUME_SYSTEM_ROTATE"
    args        TEXT    NOT NULL DEFAULT '{}',  -- JSON : { "target": "opera.exe" }
    UNIQUE(profile_id, page_id, source_type, key_id)
);

-- ------------------------------------------------------------
-- Feedbacks : réactions visuelles/haptiques liées à un binding
-- Un binding peut avoir plusieurs feedbacks (ex: vibrer + changer couleur)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedbacks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    binding_id  INTEGER NOT NULL REFERENCES bindings(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL CHECK(type IN ('haptic', 'led', 'draw')),
    params      TEXT    NOT NULL DEFAULT '{}'
    -- params selon le type :
    --
    -- haptic : { "pattern": "SHORT_LOW" }
    --          patterns disponibles : SHORT, MEDIUM, LONG, LOW, SHORT_LOW,
    --          SHORT_LOWER, LOWER, LOWEST, BUZZ, RISE_FALL,
    --          DESCEND_SLOW/MED/FAST, ASCEND_SLOW/MED/FAST,
    --          REV_SLOWEST/SLOW/MED/FAST/FASTER/FASTEST,
    --          RUMBLE1-5, VERY_LONG
    --
    -- led    : { "color": "#FF0000" }
    --          uniquement pour les boutons physiques (0-7 + knobs)
    --
    -- draw   : { "renderer": "fill",     "color": "#FF0000" }
    --          { "renderer": "text",     "label": "MUTE", "color": "#FFF", "bg": "#FF0000", "fontSize": 14 }
    --          { "renderer": "icon",     "src": "mute.png" }
    --          { "renderer": "statebar", "value_action": "GET_VOLUME_SYSTEM", "color": "#00FF00", "bg": "#111" }
    --          uniquement pour les touches tactiles (touch 0-14)
);

-- ------------------------------------------------------------
-- Index utiles
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bindings_lookup
    ON bindings(profile_id, page_id, source_type, key_id);

CREATE INDEX IF NOT EXISTS idx_feedbacks_binding
    ON feedbacks(binding_id);

CREATE INDEX IF NOT EXISTS idx_pages_profile
    ON pages(profile_id, page_order);

-- ------------------------------------------------------------
-- Variables d'état personnalisées
-- Définition persistante ; valeur runtime chargée au démarrage.
-- Si persist_value = 1, la dernière valeur est restaurée.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS variables (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT UNIQUE NOT NULL,
    type          TEXT NOT NULL DEFAULT 'boolean'
                  CHECK(type IN ('boolean', 'number', 'string')),
    default_value TEXT,     -- JSON encodé, valeur initiale au démarrage
    last_value    TEXT,     -- JSON encodé, restauré si persist_value = 1
    persist_value INTEGER NOT NULL DEFAULT 0,
    description   TEXT     NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_variables_name ON variables(name);