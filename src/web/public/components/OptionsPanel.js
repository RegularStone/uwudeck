// src/web/public/components/OptionsPanel.js
import { api } from '../app.js';

export class OptionsPanel {

    constructor(panel, content, toggleBtn) {
        this.panel     = panel;
        this.content   = content;
        this.toggleBtn = toggleBtn;

        this._variables   = [];   // définitions BDD
        this._state       = {};   // valeurs runtime
        this._resolvers   = [];   // resolvers statebar
        this._editingId   = null; // id de la variable en cours d'édition (null = création)
        this._showForm    = false;
        this._collapsed   = new Set(); // groupes repliés
        this._activeTab   = 'variables';

        toggleBtn.addEventListener('click', () => this._toggleCollapse());
    }

    // ---------------------------------------------------------------- //
    //  Init & refresh
    // ---------------------------------------------------------------- //

    async refresh() {
        const [defs, state, resolvers] = await Promise.all([
            api('/variables'),
            api('/variables/state'),
            api('/statebar-resolvers'),
        ]);
        this._variables = defs;
        this._state     = state;
        this._resolvers = resolvers;
        this._render();
    }

    /** Met à jour une valeur runtime sans re-fetcher */
    updateState(name, value) {
        this._state[name] = value;
        const el = this.content.querySelector(`[data-var-name="${CSS.escape(name)}"] .var-value`);
        if (el) {
            el.textContent = _formatValue(value);
            el.className   = 'var-value' + (value === null ? ' is-null' : '');
        }
    }

    // ---------------------------------------------------------------- //
    //  Collapse/expand du panneau entier
    // ---------------------------------------------------------------- //

    _toggleCollapse() {
        this.panel.classList.toggle('collapsed');
    }

    // ---------------------------------------------------------------- //
    //  Rendu
    // ---------------------------------------------------------------- //

    _render() {
        this.content.innerHTML = '';
        this.content.appendChild(this._buildTabs());
        if (this._activeTab === 'variables') {
            this.content.appendChild(this._buildVariablesSection());
        } else {
            this.content.appendChild(this._buildResolversSection());
        }
    }

    _buildTabs() {
        const tabs = document.createElement('div');
        tabs.className = 'options-tabs';

        for (const [id, label] of [['variables', 'Variables'], ['resolvers', 'Resolvers']]) {
            const btn = document.createElement('button');
            btn.className   = `options-tab${this._activeTab === id ? ' active' : ''}`;
            btn.textContent = label;
            btn.addEventListener('click', () => {
                this._activeTab = id;
                this._showForm  = false;
                this._render();
            });
            tabs.appendChild(btn);
        }
        return tabs;
    }

    _buildResolversSection() {
        const section = document.createElement('div');

        if (!this._resolvers.length) {
            const empty = document.createElement('p');
            empty.className   = 'text-muted';
            empty.style.fontSize = '12px';
            empty.textContent = 'Aucun resolver disponible.';
            section.appendChild(empty);
            return section;
        }

        const list = document.createElement('div');
        list.className = 'resolver-list';

        for (const r of this._resolvers) {
            const item = document.createElement('div');
            item.className = 'resolver-chip-item';
            item.title     = r.description || r.value_action;

            const key = document.createElement('span');
            key.className   = 'resolver-chip-key';
            key.textContent = `{{${r.value_action}}}`;

            const desc = document.createElement('span');
            desc.className   = 'resolver-chip-desc';
            desc.textContent = r.description || '';

            item.appendChild(key);
            if (r.description) item.appendChild(desc);

            item.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('resolver:insert', {
                    detail: { key: r.value_action },
                }));
            });

            list.appendChild(item);
        }

        section.appendChild(list);
        return section;
    }

    _buildVariablesSection() {
        const section = document.createElement('div');

        const title = document.createElement('div');
        title.className   = 'options-section-title';
        title.textContent = 'Variables';
        section.appendChild(title);

        // Regrouper les variables
        const groups = _groupVariables(this._variables);

        const list = document.createElement('div');
        list.className   = 'var-list';
        list.style.marginTop = '10px';

        for (const [groupName, vars] of groups) {
            if (groupName === null) {
                // Variables sans groupe — pas de header
                for (const v of vars) list.appendChild(this._buildVarItem(v));
            } else {
                list.appendChild(this._buildGroupSection(groupName, vars));
            }
        }

        section.appendChild(list);

        // Bouton "Ajouter" ou formulaire
        if (this._showForm) {
            section.appendChild(this._buildVarForm());
        } else {
            const addBtn = document.createElement('button');
            addBtn.className   = 'btn btn-sm';
            addBtn.textContent = '+ Ajouter';
            addBtn.style.marginTop = '8px';
            addBtn.style.width = '100%';
            addBtn.addEventListener('click', () => {
                this._showForm  = true;
                this._editingId = null;
                this._render();
            });
            section.appendChild(addBtn);
        }

        return section;
    }

    _buildGroupSection(groupName, vars) {
        const isCollapsed = this._collapsed.has(groupName);

        const wrapper = document.createElement('div');
        wrapper.className = 'var-group';

        // Header du groupe
        const header = document.createElement('div');
        header.className = 'var-group-header';

        const arrow = document.createElement('span');
        arrow.className   = 'var-group-arrow';
        arrow.textContent = isCollapsed ? '▶' : '▼';

        const label = document.createElement('span');
        label.className   = 'var-group-label';
        label.textContent = groupName;

        const count = document.createElement('span');
        count.className   = 'var-group-count';
        count.textContent = vars.length;

        header.appendChild(arrow);
        header.appendChild(label);
        header.appendChild(count);

        header.addEventListener('click', () => {
            if (this._collapsed.has(groupName)) {
                this._collapsed.delete(groupName);
            } else {
                this._collapsed.add(groupName);
            }
            this._render();
        });

        wrapper.appendChild(header);

        // Contenu du groupe
        if (!isCollapsed) {
            const body = document.createElement('div');
            body.className = 'var-group-body';
            for (const v of vars) body.appendChild(this._buildVarItem(v));
            wrapper.appendChild(body);
        }

        return wrapper;
    }

    _buildVarItem(v) {
        const currentValue = Object.prototype.hasOwnProperty.call(this._state, v.name)
            ? this._state[v.name]
            : null;

        const item = document.createElement('div');
        item.className = 'var-item';
        item.dataset.varName = v.name;

        // Header : nom + type
        const header = document.createElement('div');
        header.className = 'var-item-header';

        const nameEl = document.createElement('span');
        nameEl.className   = 'var-name';
        nameEl.textContent = v.name;
        nameEl.title       = v.name;

        const typeEl = document.createElement('span');
        typeEl.className   = 'var-type-badge';
        typeEl.textContent = v.type;

        header.appendChild(nameEl);
        header.appendChild(typeEl);
        item.appendChild(header);

        // Description
        if (v.description) {
            const desc = document.createElement('div');
            desc.className   = 'var-desc';
            desc.textContent = v.description;
            desc.title       = v.description;
            item.appendChild(desc);
        }

        // Valeur courante + bouton set
        const valueRow = document.createElement('div');
        valueRow.className = 'var-value-row';

        const valueEl = document.createElement('span');
        valueEl.className   = 'var-value' + (currentValue === null ? ' is-null' : '');
        valueEl.textContent = _formatValue(currentValue);

        const setBtn = document.createElement('button');
        setBtn.className   = 'var-set-btn';
        setBtn.textContent = 'set';
        setBtn.addEventListener('click', () => this._promptSetValue(v, currentValue));

        valueRow.appendChild(valueEl);
        valueRow.appendChild(setBtn);
        item.appendChild(valueRow);

        // Actions : éditer / supprimer
        const actions = document.createElement('div');
        actions.className = 'var-actions';

        const editBtn = document.createElement('button');
        editBtn.className   = 'var-edit-btn';
        editBtn.textContent = '✎';
        editBtn.title       = 'Modifier la définition';
        editBtn.addEventListener('click', () => {
            this._editingId = v.id;
            this._showForm  = true;
            this._render();
        });

        const delBtn = document.createElement('button');
        delBtn.className   = 'var-delete-btn';
        delBtn.textContent = '×';
        delBtn.title       = 'Supprimer';
        delBtn.addEventListener('click', () => this._deleteVariable(v.id, v.name));

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(actions);

        return item;
    }

    _buildVarForm() {
        const editing = this._editingId !== null
            ? this._variables.find(v => v.id === this._editingId)
            : null;

        // Liste des groupes existants pour les suggestions
        const existingGroups = [...new Set(
            this._variables.map(v => v.group).filter(Boolean)
        )].sort();

        const datalistId = 'vf-group-list';

        const form = document.createElement('div');
        form.className     = 'var-form';
        form.style.marginTop = '8px';

        form.innerHTML = `
            <div class="field">
                <label>Nom</label>
                <input type="text" id="vf-name" placeholder="ex: mute, mode, volume"
                    value="${editing ? _esc(editing.name) : ''}">
            </div>
            <div class="field">
                <label>Groupe <span class="field-hint">(optionnel)</span></label>
                <input type="text" id="vf-group" list="${datalistId}" placeholder="ex: audio, ui, stream"
                    value="${editing?.group ? _esc(editing.group) : ''}">
                <datalist id="${datalistId}">
                    ${existingGroups.map(g => `<option value="${_esc(g)}">`).join('')}
                </datalist>
            </div>
            <div class="field">
                <label>Type</label>
                <select id="vf-type">
                    <option value="boolean" ${(!editing || editing.type === 'boolean') ? 'selected' : ''}>boolean</option>
                    <option value="number"  ${editing?.type === 'number'  ? 'selected' : ''}>number</option>
                    <option value="string"  ${editing?.type === 'string'  ? 'selected' : ''}>string</option>
                </select>
            </div>
            <div class="field">
                <label>Valeur par défaut</label>
                <input type="text" id="vf-default" placeholder="null"
                    value="${editing && editing.default_value !== null ? _esc(String(editing.default_value)) : ''}">
            </div>
            <div class="field">
                <label>Description</label>
                <input type="text" id="vf-desc" placeholder="Optionnel"
                    value="${editing ? _esc(editing.description) : ''}">
            </div>
            <label class="var-persist-row">
                <input type="checkbox" id="vf-persist" ${editing?.persist_value ? 'checked' : ''}>
                Mémoriser la dernière valeur
            </label>
        `;

        const btnRow = document.createElement('div');
        btnRow.className = 'var-form-row';

        const cancelBtn = document.createElement('button');
        cancelBtn.className   = 'btn btn-sm';
        cancelBtn.textContent = 'Annuler';
        cancelBtn.addEventListener('click', () => {
            this._showForm  = false;
            this._editingId = null;
            this._render();
        });

        const saveBtn = document.createElement('button');
        saveBtn.className   = 'btn btn-sm btn-primary';
        saveBtn.textContent = editing ? 'Enregistrer' : 'Créer';
        saveBtn.addEventListener('click', () => this._saveVariable(form, editing));

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);
        form.appendChild(btnRow);

        return form;
    }

    // ---------------------------------------------------------------- //
    //  Actions
    // ---------------------------------------------------------------- //

    async _saveVariable(form, editing) {
        const name         = form.querySelector('#vf-name').value.trim();
        const group        = form.querySelector('#vf-group').value.trim() || null;
        const type         = form.querySelector('#vf-type').value;
        const defaultRaw   = form.querySelector('#vf-default').value.trim();
        const description  = form.querySelector('#vf-desc').value.trim();
        const persistValue = form.querySelector('#vf-persist').checked;

        if (!name) { alert('Le nom est requis'); return; }

        const defaultValue = _parseValue(defaultRaw, type);

        try {
            if (editing) {
                await api(`/variables/${editing.id}`, {
                    method: 'PUT',
                    body:   { name, type, defaultValue, persistValue, description, group },
                });
            } else {
                await api('/variables', {
                    method: 'POST',
                    body:   { name, type, defaultValue, persistValue, description, group },
                });
            }
            this._showForm  = false;
            this._editingId = null;
            await this.refresh();
        } catch (err) {
            alert(err.message);
        }
    }

    async _deleteVariable(id, name) {
        if (!confirm(`Supprimer la variable "${name}" ?`)) return;
        try {
            await api(`/variables/${id}`, { method: 'DELETE' });
            await this.refresh();
        } catch (err) {
            alert(err.message);
        }
    }

    async _promptSetValue(v, current) {
        const input = prompt(
            `Valeur pour "${v.name}" (${v.type})`,
            current !== null ? String(current) : '',
        );
        if (input === null) return; // annulé
        const value = _parseValue(input, v.type);
        try {
            await api('/variables/state', {
                method: 'POST',
                body:   { name: v.name, value },
            });
        } catch (err) {
            alert(err.message);
        }
    }
}

// ---------------------------------------------------------------- //
//  Utilitaires
// ---------------------------------------------------------------- //

/**
 * Regroupe les variables par group (null = sans groupe).
 * Retourne une Map ordonnée : groupes nommés en premier (alphabétique), null en dernier.
 */
function _groupVariables(variables) {
    const map = new Map();

    for (const v of variables) {
        const key = v.group ?? null;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(v);
    }

    // Trier : groupes nommés alphabétiquement, null à la fin
    const sorted = new Map();
    const namedKeys = [...map.keys()].filter(k => k !== null).sort();
    for (const k of namedKeys) sorted.set(k, map.get(k));
    if (map.has(null)) sorted.set(null, map.get(null));

    return sorted;
}

function _formatValue(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

function _parseValue(raw, type) {
    if (raw === '' || raw === 'null') return null;
    if (type === 'boolean') return raw === 'true' || raw === '1';
    if (type === 'number')  return Number(raw);
    return raw;
}

function _esc(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
