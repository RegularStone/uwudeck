// src/web/public/components/ProfileManager.js
import { api } from '../app.js';

export class ProfileManager {
    /**
     * @param {Function} onChanged - callback appelé après toute modification (profil ou page)
     */
    constructor(onChanged) {
        this._onChanged = onChanged;
        this._profiles  = [];
        this._overlay   = null;
        this._isOpen    = false;
        this._build();
    }

    // ---------------------------------------------------------------- //
    //  Construction du DOM (une seule fois)
    // ---------------------------------------------------------------- //

    _build() {
        this._overlay = document.createElement('div');
        this._overlay.className = 'profile-modal-overlay hidden';
        this._overlay.innerHTML = `
            <div class="profile-modal">
                <div class="profile-modal-header">
                    <span>Gestion des profils</span>
                    <button class="profile-modal-close" id="pm-close">×</button>
                </div>
                <div class="profile-modal-body" id="pm-body"></div>
            </div>
        `;
        document.body.appendChild(this._overlay);

        this._overlay.querySelector('#pm-close')
            .addEventListener('click', () => this.close());

        // Clic hors du panneau = fermeture
        this._overlay.addEventListener('click', e => {
            if (e.target === this._overlay) this.close();
        });
    }

    // ---------------------------------------------------------------- //
    //  Ouverture / fermeture
    // ---------------------------------------------------------------- //

    async open() {
        this._isOpen = true;
        this._overlay.classList.remove('hidden');
        await this._load();
    }

    close() {
        this._isOpen = false;
        this._overlay.classList.add('hidden');
    }

    /** Rafraîchit le contenu si la modal est ouverte (appelé par WS profiles:changed) */
    async refresh() {
        if (!this._isOpen) return;
        await this._load();
    }

    // ---------------------------------------------------------------- //
    //  Chargement + rendu
    // ---------------------------------------------------------------- //

    async _load() {
        this._profiles = await api('/profiles');
        this._render();
    }

    _render() {
        const body = this._overlay.querySelector('#pm-body');
        body.innerHTML = `
            <div class="profile-list" id="pm-profile-list">
                ${this._profiles.map(p => this._renderProfile(p)).join('')}
            </div>
            <div class="profile-create-row">
                <input type="text" id="pm-new-profile-name" placeholder="Nom du nouveau profil…">
                <button class="btn btn-sm btn-primary" id="pm-btn-create">+ Créer</button>
            </div>
        `;
        this._attachEvents();
    }

    _renderProfile(profile) {
        const isActive = !!profile.active;
        return `
            <div class="profile-item ${isActive ? 'is-active' : ''}" data-profile-id="${profile.id}">
                <div class="profile-item-header">
                    <span class="profile-item-name">${_esc(profile.name)}</span>
                    ${isActive
                        ? `<span class="profile-active-badge">ACTIF</span>`
                        : `<button class="btn btn-sm" data-action="activate" data-id="${profile.id}">Activer</button>
                           <button class="btn btn-sm btn-danger" data-action="delete-profile" data-id="${profile.id}">Supprimer</button>`
                    }
                    <button class="btn btn-sm" data-action="rename-profile" data-id="${profile.id}" title="Renommer">✎</button>
                </div>
                <div class="profile-pages-section">
                    ${profile.pages.map(p => this._renderPage(p)).join('')}
                    <div class="page-add-row">
                        <input type="text" class="pm-new-page-input" placeholder="Nouvelle page…" data-profile-id="${profile.id}">
                        <button class="btn btn-sm" data-action="add-page" data-profile-id="${profile.id}">+</button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderPage(page) {
        return `
            <div class="page-item" data-page-id="${page.id}">
                <span class="page-item-name">${_esc(page.name)}</span>
                <button class="btn btn-sm" data-action="rename-page" data-id="${page.id}" title="Renommer">✎</button>
                <button class="page-delete-btn" data-action="delete-page" data-id="${page.id}" title="Supprimer">×</button>
            </div>
        `;
    }

    // ---------------------------------------------------------------- //
    //  Événements
    // ---------------------------------------------------------------- //

    _attachEvents() {
        const body = this._overlay.querySelector('#pm-body');

        // Créer un profil
        body.querySelector('#pm-btn-create')?.addEventListener('click', () => {
            const input = body.querySelector('#pm-new-profile-name');
            this._createProfile(input.value);
        });

        body.querySelector('#pm-new-profile-name')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                this._createProfile(e.target.value);
            }
        });

        // Délégation pour tous les boutons du corps
        body.addEventListener('click', async e => {
            const action    = e.target.dataset.action;
            const id        = parseInt(e.target.dataset.id);
            const profileId = parseInt(e.target.dataset.profileId);

            if (action === 'activate')        await this._activateProfile(id);
            if (action === 'delete-profile')  await this._deleteProfile(id);
            if (action === 'rename-profile')  this._startRenameProfile(id);
            if (action === 'add-page')        await this._addPage(profileId, e.target);
            if (action === 'delete-page')     await this._deletePage(id);
            if (action === 'rename-page')     this._startRenamePage(id);
        });

        // Enter sur les inputs "nouvelle page"
        body.querySelectorAll('.pm-new-page-input').forEach(input => {
            input.addEventListener('keydown', async e => {
                if (e.key === 'Enter') {
                    const profileId = parseInt(e.target.dataset.profileId);
                    await this._addPage(profileId, e.target);
                }
            });
        });
    }

    // ---------------------------------------------------------------- //
    //  Actions profils
    // ---------------------------------------------------------------- //

    async _createProfile(name) {
        name = name?.trim();
        if (!name) return;
        try {
            await api('/profiles', { method: 'POST', body: { name } });
            await this._onChanged();
            await this._load();
        } catch (e) { alert(`Erreur : ${e.message}`); }
    }

    async _activateProfile(id) {
        try {
            await api(`/profiles/${id}`, { method: 'PUT', body: { active: true } });
            await this._onChanged();
            await this._load();
            // Indique que le hardware redémarre sur l'ancien profil jusqu'au restart
            _showRestartNotice(this._overlay.querySelector('#pm-body'));
        } catch (e) { alert(`Erreur : ${e.message}`); }
    }

    async _deleteProfile(id) {
        if (!confirm('Supprimer ce profil et tous ses bindings ?')) return;
        try {
            await api(`/profiles/${id}`, { method: 'DELETE' });
            await this._onChanged();
            await this._load();
        } catch (e) { alert(`Erreur : ${e.message}`); }
    }

    _startRenameProfile(id) {
        const item    = this._overlay.querySelector(`[data-profile-id="${id}"] .profile-item-name`);
        const profile = this._profiles.find(p => p.id === id);
        if (!item || !profile) return;

        this._inlineEdit(item, profile.name, async newName => {
            try {
                await api(`/profiles/${id}`, { method: 'PUT', body: { name: newName } });
                await this._onChanged();
                await this._load();
            } catch (e) { alert(`Erreur : ${e.message}`); await this._load(); }
        });
    }

    // ---------------------------------------------------------------- //
    //  Actions pages
    // ---------------------------------------------------------------- //

    async _addPage(profileId, triggerEl) {
        // Trouve l'input dans la même .page-add-row
        const row   = triggerEl.closest('.page-add-row') ?? triggerEl.parentElement;
        const input = row?.querySelector('.pm-new-page-input');
        const name  = input?.value?.trim();
        if (!name) return;
        try {
            await api(`/profiles/${profileId}/pages`, { method: 'POST', body: { name } });
            await this._onChanged();
            await this._load();
        } catch (e) { alert(`Erreur : ${e.message}`); }
    }

    async _deletePage(id) {
        if (!confirm('Supprimer cette page et tous ses bindings ?')) return;
        try {
            await api(`/pages/${id}`, { method: 'DELETE' });
            await this._onChanged();
            await this._load();
        } catch (e) { alert(`Erreur : ${e.message}`); }
    }

    _startRenamePage(id) {
        const item = this._overlay.querySelector(`[data-page-id="${id}"] .page-item-name`);
        const page = this._profiles.flatMap(p => p.pages).find(p => p.id === id);
        if (!item || !page) return;

        this._inlineEdit(item, page.name, async newName => {
            try {
                await api(`/pages/${id}`, { method: 'PUT', body: { name: newName } });
                await this._onChanged();
                await this._load();
            } catch (e) { alert(`Erreur : ${e.message}`); await this._load(); }
        });
    }

    // ---------------------------------------------------------------- //
    //  Inline edit helper
    // ---------------------------------------------------------------- //

    _inlineEdit(spanEl, currentValue, onSave) {
        const input = document.createElement('input');
        input.className = 'inline-edit-input';
        input.value     = currentValue;
        spanEl.replaceWith(input);
        input.focus();
        input.select();

        let saved = false;

        const commit = async () => {
            if (saved) return;
            saved = true;
            const newVal = input.value.trim();
            if (newVal && newVal !== currentValue) {
                await onSave(newVal);
            } else {
                await this._load(); // restaure sans changement
            }
        };

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { saved = true; this._load(); }
        });

        input.addEventListener('blur', commit);
    }
}

// ------------------------------------------------------------------ //
//  Utilitaires
// ------------------------------------------------------------------ //

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _showRestartNotice(container) {
    // Évite les doublons
    if (container.querySelector('.restart-notice')) return;
    const notice = document.createElement('div');
    notice.className   = 'restart-notice';
    notice.textContent = '⚠ Redémarre l\'application pour que le profil soit actif sur le matériel.';
    container.appendChild(notice);
}
