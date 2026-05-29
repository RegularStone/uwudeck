// src/web/public/app.js
import { Grid }           from './components/Grid.js';
import { KeyEditor }      from './components/KeyEditor.js';
import { ProfileManager } from './components/ProfileManager.js';
import { OptionsPanel }   from './components/OptionsPanel.js';

// ------------------------------------------------------------------ //
//  État global de l'application
// ------------------------------------------------------------------ //

const state = {
    profile:     null,
    pages:       [],
    currentPage: null,   // { id, name } | 'global'
    bindings:    [],     // bindings de la page courante
    selected:    null,   // { sourceType, keyId, binding? }
};

// ------------------------------------------------------------------ //
//  Composants
// ------------------------------------------------------------------ //

const grid           = new Grid(document.getElementById('touch-grid'), onKeySelect);
const editor         = new KeyEditor(
    document.getElementById('editor-content'),
    document.getElementById('editor-empty'),
    onBindingSaved
);
const profileManager = new ProfileManager(onProfilesChanged);
const optionsPanel   = new OptionsPanel(
    document.getElementById('options-panel'),
    document.getElementById('options-content'),
    document.getElementById('options-toggle'),
);

// ------------------------------------------------------------------ //
//  Initialisation
// ------------------------------------------------------------------ //

async function init() {
    await loadProfile();
    await optionsPanel.refresh();
    connectWebSocket();
    setupDeviceControls();
    setupEditorResize();
    document.getElementById('btn-open-profiles')
        .addEventListener('click', () => profileManager.open());
}

function setupEditorResize() {
    const handle = document.getElementById('editor-resize-handle');
    const main   = document.getElementById('main');
    const MIN_W  = 260;
    const MAX_W  = 700;
    const STORE_KEY = 'uwudeck_editor_width';

    const saved = parseInt(localStorage.getItem(STORE_KEY));
    if (saved && saved >= MIN_W && saved <= MAX_W) {
        main.style.setProperty('--editor-width', `${saved}px`);
    }

    let startX, startW;

    handle.addEventListener('mousedown', e => {
        startX = e.clientX;
        startW = document.getElementById('editor-panel').getBoundingClientRect().width;
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = e => {
            const delta = startX - e.clientX;
            const newW  = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
            main.style.setProperty('--editor-width', `${newW}px`);
        };

        const onUp = () => {
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const w = parseInt(getComputedStyle(main).getPropertyValue('--editor-width'));
            if (w) localStorage.setItem(STORE_KEY, w);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// ------------------------------------------------------------------ //
//  Callback : profils/pages modifiés depuis le ProfileManager
// ------------------------------------------------------------------ //

async function onProfilesChanged() {
    // Recharge le nom du profil actif et les onglets de pages
    await refreshProfileMeta();
}

async function refreshProfileMeta() {
    const profile = await api('/profile');
    state.profile = profile;
    state.pages   = profile.pages;
    document.getElementById('profile-name').textContent = profile.name;
    renderPageTabs();
    // Restaure l'onglet actif
    document.querySelectorAll('.page-tab').forEach(btn => {
        const id = btn.dataset.pageId;
        const isActive = state.currentPage === 'global'
            ? id === 'global'
            : String(state.currentPage?.id) === id;
        btn.classList.toggle('active', isActive);
    });
}

async function loadProfile() {
    const profile = await api('/profile');
    state.profile = profile;
    state.pages   = profile.pages;

    document.getElementById('profile-name').textContent = profile.name;
    renderPageTabs();

    // Charge la première page par défaut
    await switchPage(state.pages[0] ?? null);
}

// ------------------------------------------------------------------ //
//  Navigation entre pages
// ------------------------------------------------------------------ //

function renderPageTabs() {
    const container = document.getElementById('page-tabs');
    container.innerHTML = '';

    state.pages.forEach(page => {
        const btn = document.createElement('button');
        btn.className = 'page-tab';
        btn.textContent = page.name;
        btn.dataset.pageId = page.id;
        btn.addEventListener('click', () => switchPage(page));
        container.appendChild(btn);
    });

    // Onglet "global"
    const globalBtn = document.createElement('button');
    globalBtn.className = 'page-tab tab-global';
    globalBtn.textContent = 'global';
    globalBtn.dataset.pageId = 'global';
    globalBtn.addEventListener('click', () => switchPage('global'));
    container.appendChild(globalBtn);
}

async function switchPage(page) {
    state.currentPage = page;
    state.selected    = null;

    // Met à jour les onglets actifs
    document.querySelectorAll('.page-tab').forEach(btn => {
        const id = btn.dataset.pageId;
        const isActive = page === 'global'
            ? id === 'global'
            : String(page?.id) === id;
        btn.classList.toggle('active', isActive);
    });

    // Charge les bindings
    const pageParam = page === 'global' ? 'global' : page.id;
    state.bindings = await api(`/pages/${pageParam}/bindings`);

    // Met à jour la grille
    grid.render(state.bindings);

    // Met à jour les contrôles latéraux
    renderSideControls();

    // Ferme l'éditeur
    editor.close();
}

// ------------------------------------------------------------------ //
//  Grille tactile — sélection d'une touche
// ------------------------------------------------------------------ //

function onKeySelect(sourceType, keyId) {
    state.selected = { sourceType, keyId };

    // Trouve le binding existant pour cette clé (page courante ou global)
    const binding = state.bindings.find(b =>
        b.source_type === sourceType && b.key_id === String(keyId)
    ) ?? null;

    // Surligne la touche
    document.querySelectorAll('[data-source]').forEach(el => {
        el.classList.toggle(
            'selected',
            el.dataset.source === sourceType && el.dataset.id === String(keyId)
        );
    });

    // Ouvre l'éditeur
    const pageId = state.currentPage === 'global' ? null : state.currentPage?.id;
    editor.open({ sourceType, keyId, binding, pageId });
}

// ------------------------------------------------------------------ //
//  Callback : binding sauvegardé depuis l'éditeur
// ------------------------------------------------------------------ //

async function onBindingSaved() {
    // Recharge les bindings de la page courante
    const pageParam = state.currentPage === 'global' ? 'global' : state.currentPage?.id;
    state.bindings = await api(`/pages/${pageParam}/bindings`);
    grid.render(state.bindings);
    renderSideControls();
}

// ------------------------------------------------------------------ //
//  Contrôles latéraux (boutons physiques + molettes)
// ------------------------------------------------------------------ //

function setupDeviceControls() {
    document.querySelectorAll('[data-source]').forEach(el => {
        if (el.classList.contains('touch-key')) return; // géré par Grid
        el.addEventListener('click', () => {
            onKeySelect(el.dataset.source, el.dataset.id);
        });
    });
}

function renderSideControls() {
    document.querySelectorAll('[data-source]').forEach(el => {
        if (el.classList.contains('touch-key')) return;
        const sourceType = el.dataset.source;
        const keyId      = el.dataset.id;
        const hasBinding = state.bindings.some(
            b => b.source_type === sourceType && b.key_id === String(keyId)
        );
        el.classList.toggle('has-binding', hasBinding);
    });
}

// ------------------------------------------------------------------ //
//  WebSocket — mises à jour live depuis le serveur
// ------------------------------------------------------------------ //

function connectWebSocket() {
    const dot = document.getElementById('status-dot');
    const ws  = new WebSocket(`ws://${location.host}`);

    ws.onopen = () => {
        dot.className = 'status-dot connected';
    };

    ws.onclose = () => {
        dot.className = 'status-dot disconnected';
        // Reconnexion automatique après 2s
        setTimeout(connectWebSocket, 2000);
    };

    ws.onmessage = async ({ data }) => {
        const event = JSON.parse(data);

        if (event.type === 'profiles:changed') {
            await refreshProfileMeta();
            profileManager.refresh();
            return;
        }

        // Valeur d'une variable changée en temps réel
        if (event.type === 'variable:state_changed') {
            optionsPanel.updateState(event.name, event.value);
            return;
        }

        // Définition des variables modifiée (création / suppression / édition)
        if (event.type === 'variables:changed') {
            await optionsPanel.refresh();
            KeyEditor.refreshVariables();
            return;
        }

        if (['binding:updated', 'binding:deleted', 'feedback:updated',
             'feedback:deleted', 'feedbacks:replaced'].includes(event.type)) {
            await onBindingSaved();

            // Si la touche éditée est concernée, rafraîchit l'éditeur
            if (state.selected) {
                const pageParam = state.currentPage === 'global' ? 'global' : state.currentPage?.id;
                state.bindings = await api(`/pages/${pageParam}/bindings`);
                const binding = state.bindings.find(b =>
                    b.source_type === state.selected.sourceType &&
                    b.key_id      === String(state.selected.keyId)
                ) ?? null;
                if (editor.isOpen) {
                    const pageId = state.currentPage === 'global' ? null : state.currentPage?.id;
                    editor.open({ ...state.selected, binding, pageId });
                }
            }
        }
    };
}

// ------------------------------------------------------------------ //
//  Utilitaire API fetch
// ------------------------------------------------------------------ //

export async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json();
}

// ------------------------------------------------------------------ //
//  Démarrage
// ------------------------------------------------------------------ //

init();