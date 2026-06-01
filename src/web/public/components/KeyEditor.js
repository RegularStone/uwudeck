// src/web/public/components/KeyEditor.js
import { api } from '../app.js';

// Actions, variables et resolvers chargés depuis l'API
let ACTIONS            = [];
let VARIABLES          = [];
let STATEBAR_RESOLVERS = [];
fetch('/api/actions').then(r => r.json()).then(a => { ACTIONS   = a; });
fetch('/api/variables').then(r => r.json()).then(v => { VARIABLES = v; });
fetch('/api/statebar-resolvers').then(r => r.json()).then(r => { STATEBAR_RESOLVERS = r; });

const HAPTIC_PATTERNS = [
    'SHORT', 'SHORT_LOW', 'SHORT_LOWER', 'MEDIUM', 'LONG',
    'LOW', 'LOWER', 'LOWEST', 'BUZZ', 'RISE_FALL',
    'DESCEND_SLOW', 'DESCEND_MED', 'DESCEND_FAST',
    'ASCEND_SLOW', 'ASCEND_MED', 'ASCEND_FAST',
    'RUMBLE1', 'RUMBLE2', 'RUMBLE3', 'RUMBLE4', 'RUMBLE5',
];

const RENDERERS = ['fill', 'text', 'icon', 'statebar'];

export class KeyEditor {

    static refreshVariables() {
        fetch('/api/variables').then(r => r.json()).then(v => { VARIABLES = v; });
    }

    constructor(content, empty, onSaved) {
        this.content          = content;
        this.empty            = empty;
        this.onSaved          = onSaved;
        this.isOpen           = false;
        this._ctx             = null; // { sourceType, keyId, binding, pageId }
        this._abortController = null; // annule les listeners de l'éditeur précédent
    }

    open(ctx) {
        this._ctx   = ctx;
        this.isOpen = true;
        this.empty.classList.add('hidden');
        this.content.classList.remove('hidden');
        this._render();
    }

    close() {
        this.isOpen = false;
        this._ctx   = null;
        this.content.classList.add('hidden');
        this.empty.classList.remove('hidden');
    }

    // ---------------------------------------------------------------- //
    //  Rendu principal
    // ---------------------------------------------------------------- //

    _render() {
        const { sourceType, keyId, binding } = this._ctx;

        this.content.innerHTML = `
            <!-- En-tête clé -->
            <div class="editor-section">
                <div class="editor-section-title">Touche sélectionnée</div>
                <div class="editor-key-header">
                    <span class="key-type-badge">${sourceType}</span>
                    <span class="key-id-label">${keyId}</span>
                    ${binding ? `<span class="text-muted text-mono" style="font-size:10px;margin-left:auto">#${binding.id}</span>` : ''}
                </div>
            </div>

            <!-- Action -->
            <div class="editor-section" id="section-action">
                <div class="editor-section-title">Action</div>
                ${this._renderActionForm(binding)}
            </div>

            <!-- Feedbacks -->
            <div class="editor-section" id="section-feedbacks">
                <div class="editor-section-title">Feedbacks</div>
                <div class="feedback-list" id="feedback-list">
                    ${binding ? this._renderFeedbacks(binding.feedbacks ?? []) : '<p class="text-muted" style="font-size:12px">Sauvegarde d\'abord une action.</p>'}
                </div>
                ${binding ? this._renderAddFeedback() : ''}
            </div>

            <!-- Supprimer le binding -->
            ${binding ? `
            <div class="editor-section">
                <button class="btn btn-danger btn-sm" id="btn-delete-binding">Supprimer ce binding</button>
            </div>` : ''}
        `;

        this._attachEvents();
    }

    // ---------------------------------------------------------------- //
    //  Formulaire d'action
    // ---------------------------------------------------------------- //

    _renderActionForm(binding) {
        const { sourceType } = this._ctx;

        // Filtre les actions compatibles avec ce sourceType
        const compatible = ACTIONS.filter(a =>
            a.sourceTypes.includes(sourceType) || a.sourceTypes.includes('*')
        );

        const currentAction = binding?.action ?? '';
        const currentArgs   = binding?.args   ?? {};

        // Sépare les effets des args purs pour l'affichage
        const { _effects: currentEffects = [], ...displayArgs } = currentArgs;

        const options = compatible.map(a =>
            `<option value="${a.name}" ${a.name === currentAction ? 'selected' : ''}>${a.name}</option>`
        ).join('');

        const selectedAction = compatible.find(a => a.name === currentAction);
        const argsHtml       = this._renderArgs(selectedAction?.args ?? [], displayArgs, selectedAction?.argTypes ?? {});

        return `
            <div class="field">
                <label>Action</label>
                <select id="select-action">
                    <option value="">— Aucune action —</option>
                    ${options}
                </select>
            </div>
            <div id="args-container">${argsHtml}</div>
            ${this._renderEffects(currentEffects)}
            <div class="btn-group">
                <button class="btn btn-primary" id="btn-save-action">Enregistrer</button>
                <button class="btn btn-sm" id="btn-preview-action">Prévisualiser</button>
            </div>
        `;
    }

    _renderArgs(argNames, currentArgs, argTypes = {}) {
        if (!argNames.length) return '';
        return argNames.map(name => {
            const argType = argTypes[name];
            if (argType === 'audio-device-output' || argType === 'audio-device-input') {
                return this._renderAudioDeviceArg(name, currentArgs[name] ?? '', argType);
            }
            return `
            <div class="field">
                <label>${name}</label>
                <input type="text" id="arg-${name}" value="${currentArgs[name] ?? ''}" placeholder="${name}">
            </div>`;
        }).join('');
    }

    _renderAudioDeviceArg(argName, currentValue, argType) {
        const deviceKind = argType === 'audio-device-output' ? 'outputs' : 'inputs';
        const label      = argType === 'audio-device-output' ? 'Sortie audio' : 'Entrée audio';
        return `
            <div class="field audio-device-field" data-arg-name="${argName}" data-device-kind="${deviceKind}">
                <label>${label}
                    <button type="button" class="btn btn-sm btn-audio-rescan" title="Rescanner les périphériques">↺</button>
                </label>
                <select id="arg-${argName}" class="audio-device-select">
                    <option value="${currentValue ?? ''}">${currentValue ? currentValue : '— Sélectionner —'}</option>
                </select>
                <span class="audio-device-loading text-muted" style="font-size:10px;display:none">Scan en cours…</span>
            </div>`;
    }

    async _loadAudioDevices(fieldEl) {
        const kind    = fieldEl.dataset.deviceKind;
        const select  = fieldEl.querySelector('.audio-device-select');
        const loading = fieldEl.querySelector('.audio-device-loading');
        const current = select.value;
        loading.style.display = '';
        try {
            const data    = await api('/audio-devices');
            const devices = data[kind] ?? [];
            select.innerHTML = `<option value="">— Sélectionner —</option>` +
                devices.map(d =>
                    `<option value="${d.id}" ${d.id === current ? 'selected' : ''}>${d.name}${d.isDefault ? ' ✓' : ''}</option>`
                ).join('');
        } catch (e) {
            select.innerHTML = `<option value="">Erreur : ${e.message}</option>`;
        } finally {
            loading.style.display = 'none';
        }
    }

    _renderEffects(effects) {
        if (!VARIABLES.length) return '';
        const rows = effects.map((e, i) => this._renderEffectRow(e, i)).join('');
        return `
            <div id="effects-container">
                <div class="effects-header">
                    <span class="effects-title">Effets sur variables</span>
                    <button type="button" class="btn btn-sm" id="btn-add-effect">+ Effet</button>
                </div>
                <div id="effects-list">${rows}</div>
            </div>
        `;
    }

    _renderEffectRow(effect = {}, idx) {
        const varOptions = VARIABLES.map(v =>
            `<option value="${v.name}" ${v.name === effect.name ? 'selected' : ''}>${v.name} (${v.type})</option>`
        ).join('');
        const isToggle = !effect.op || effect.op === 'toggle';
        return `
            <div class="effect-row" data-effect-idx="${idx}">
                <select class="effect-var">
                    <option value="">— variable —</option>
                    ${varOptions}
                </select>
                <select class="effect-op">
                    <option value="toggle" ${isToggle ? 'selected' : ''}>toggle</option>
                    <option value="set"    ${effect.op === 'set' ? 'selected' : ''}>&equals; set</option>
                </select>
                <input type="text" class="effect-value"
                    placeholder="valeur"
                    value="${effect.value !== undefined && effect.value !== null ? String(effect.value) : ''}"
                    style="${isToggle ? 'display:none' : ''}">
                <button type="button" class="btn-effect-remove" title="Retirer">×</button>
            </div>
        `;
    }

    // ---------------------------------------------------------------- //
    //  Feedbacks
    // ---------------------------------------------------------------- //

    _renderFeedbacks(feedbacks) {
        if (!feedbacks.length) return '<p class="text-muted" style="font-size:12px">Aucun feedback.</p>';
        return feedbacks.map(f => this._renderFeedbackItem(f)).join('');
    }

    _renderFeedbackItem(feedback) {
        const isConditional = Array.isArray(feedback.params?.cases);
        const paramsHtml    = this._renderFeedbackParams(feedback);
        return `
            <div class="feedback-item" data-feedback-id="${feedback.id}">
                <div class="feedback-item-header">
                    <span class="feedback-type-badge ${feedback.type}">${feedback.type}</span>
                    ${feedback.type === 'draw' || feedback.type === 'led' ? `
                    <button class="feedback-cond-btn${isConditional ? ' active' : ''}"
                        data-action="toggle-conditional" data-id="${feedback.id}"
                        title="${isConditional ? 'Revenir en mode direct' : 'Activer le mode conditionnel (variables)'}">⌥</button>
                    ` : ''}
                    <button class="feedback-delete-btn" data-action="delete-feedback" data-id="${feedback.id}">×</button>
                </div>
                <div class="feedback-params">
                    ${paramsHtml}
                </div>
                <button class="btn btn-sm" data-action="save-feedback" data-id="${feedback.id}">Sauvegarder</button>
            </div>
        `;
    }

    _renderFeedbackParams(feedback) {
        // Mode conditionnel : cases stockés dans params.cases
        if (Array.isArray(feedback.params?.cases)) {
            return this._renderCasesEditor(feedback);
        }

        const p = feedback.params;
        switch (feedback.type) {

            case 'haptic':
                return `
                    <div class="field">
                        <label>Pattern</label>
                        <select data-param="pattern" data-feedback-id="${feedback.id}">
                            ${HAPTIC_PATTERNS.map(pat =>
                                `<option value="${pat}" ${pat === (p.pattern ?? 'SHORT_LOW') ? 'selected' : ''}>${pat}</option>`
                            ).join('')}
                        </select>
                    </div>`;

            case 'led':
                return `
                    ${this._renderTargetSelector(feedback, 'buttons')}
                    <div class="field">
                        <label>Couleur</label>
                        <input type="color" data-param="color" data-feedback-id="${feedback.id}" value="${p.color ?? '#ffffff'}">
                    </div>`;

            case 'draw':
                return `
                    ${this._renderTargetSelector(feedback, 'touch')}
                    <div class="field">
                        <label>Renderer</label>
                        <select data-param="renderer" data-feedback-id="${feedback.id}">
                            ${RENDERERS.map(r => `<option value="${r}" ${r === (p.renderer ?? 'fill') ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                    </div>
                    ${this._renderDrawParams(feedback)}`;

            case 'screen':
                return `
                    <div class="field">
                        <label>Scène</label>
                        <input type="text" data-param="scene" data-feedback-id="${feedback.id}" value="${p.scene ?? ''}" placeholder="nom_de_la_scene">
                    </div>`;

            case 'animation': {
                const animSelect = document.createElement('select');
                fetch('/api/screensaver').then(r => r.json()).then(data => {
                    const sel = document.querySelector(`select[data-param="animation_id"][data-feedback-id="${feedback.id}"]`);
                    if (!sel) return;
                    sel.innerHTML = data.animations.map(id =>
                        `<option value="${id}" ${id === (p.animation_id ?? '') ? 'selected' : ''}>${id}</option>`
                    ).join('');
                });
                return `
                    <div class="field">
                        <label>Animation</label>
                        <select data-param="animation_id" data-feedback-id="${feedback.id}">
                            <option value="">Chargement…</option>
                        </select>
                    </div>`;
            }

            default:
                return `<span class="text-muted" style="font-size:11px">Params: ${JSON.stringify(p)}</span>`;
        }
    }

    // Sélecteur de touche cible (pour draw et led)
    // defaultSourceType : 'touch' pour draw, 'buttons' pour led
    _renderTargetSelector(feedback, defaultSourceType) {
        const p   = feedback.params;
        const fid = feedback.id;

        // Clés disponibles selon le sourceType
        const TOUCH_KEYS   = Array.from({length: 15}, (_, i) => String(i));
        const BUTTON_KEYS  = ['knobTL', 'knobCL', '0', '1', '2', '3'];

        const currentSourceType = p.target_source_type ?? defaultSourceType;
        const currentKeyId      = p.target_key_id ?? '';

        const keys = currentSourceType === 'touch' ? TOUCH_KEYS : BUTTON_KEYS;

        const sourceOptions = ['touch', 'buttons'].map(t =>
            `<option value="${t}" ${t === currentSourceType ? 'selected' : ''}>${t}</option>`
        ).join('');

        const keyOptions = `<option value="">— même touche —</option>` +
            keys.map(k => `<option value="${k}" ${k === currentKeyId ? 'selected' : ''}>${k}</option>`).join('');

        return `
            <div class="target-selector">
                <div class="target-selector-label">Cible du feedback</div>
                <div class="target-selector-row">
                    <select data-param="target_source_type" data-feedback-id="${fid}" class="target-source-select">
                        ${sourceOptions}
                    </select>
                    <select data-param="target_key_id" data-feedback-id="${fid}" class="target-key-select">
                        ${keyOptions}
                    </select>
                </div>
            </div>`;
    }

    _renderDrawParams(feedback) {
        const p        = feedback.params;
        const renderer = p.renderer ?? 'fill';
        const fid      = feedback.id;

        const colorField = (param, label, def) => `
            <div class="field">
                <label>${label}</label>
                <input type="color" data-param="${param}" data-feedback-id="${fid}" value="${p[param] ?? def}">
            </div>`;

        const textField = (param, label, def = '') => `
            <div class="field">
                <label>${label}</label>
                <input type="text" data-param="${param}" data-feedback-id="${fid}" value="${p[param] ?? def}" placeholder="${label}">
            </div>`;

        switch (renderer) {
            case 'fill':
                return colorField('color', 'Couleur', '#000000');

            case 'text':
                return `
                    ${textField('label', 'Label', 'TEXT')}
                    ${colorField('color', 'Couleur texte', '#ffffff')}
                    ${colorField('bg',    'Fond',          '#000000')}
                    ${textField('fontSize', 'Taille police', '13')}
                    ${this._renderPaddingFields(p, fid)}`;

            case 'icon':
                return `
                    ${textField('src', 'Fichier (src/assets/icons/)')}
                    ${colorField('bg', 'Fond', '#000000')}
                    <div class="field">
                        <label>Fit</label>
                        <select data-param="fit" data-feedback-id="${fid}">
                            ${['contain','cover','stretch'].map(v =>
                                `<option value="${v}" ${v === (p.fit ?? 'contain') ? 'selected' : ''}>${v}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="field field-row">
                        <div class="field" style="flex:1">
                            <label>Largeur img (max 90)</label>
                            <input type="number" min="1" max="90" data-param="imgW" data-feedback-id="${fid}" value="${p.imgW ?? ''}" placeholder="auto">
                        </div>
                        <div class="field" style="flex:1">
                            <label>Hauteur img (max 90)</label>
                            <input type="number" min="1" max="90" data-param="imgH" data-feedback-id="${fid}" value="${p.imgH ?? ''}" placeholder="auto">
                        </div>
                    </div>
                    ${this._matrixPicker('imgAlign', 'Position image', p.imgAlign ?? 'mc', fid)}
                    ${this._renderPaddingFields(p, fid, null, 'img')}
                    ${textField('text', 'Texte superposé', '')}
                    ${colorField('textColor', 'Couleur texte', '#ffffff')}
                    <div class="field">
                        <label>Taille police (px)</label>
                        <input type="number" min="6" max="72" data-param="fontSize" data-feedback-id="${fid}" value="${p.fontSize ?? 12}">
                    </div>
                    ${this._matrixPicker('textAlign', 'Position texte', p.textAlign ?? 'bc', fid)}
                    ${this._renderPaddingFields(p, fid, null, 'text')}`;

            case 'statebar':
                return `
                    ${this._renderResolverField(fid, p.value_action ?? '')}
                    ${this._varTextField('label',     'Label',              p.label     ?? '',  fid)}
                    ${this._varTextField('font_size', 'Taille police (px)', p.font_size ?? '',  fid)}
                    ${colorField('color',     'Couleur barre', '#00c8ff')}
                    ${colorField('color_low', 'Couleur basse', '#e74c3c')}
                    ${colorField('bg',        'Fond',          '#1a1a1a')}
                    ${this._renderPaddingFields(p, fid)}`;

            default:
                return '';
        }
    }

    /**
     * @param {string|null} feedbackId  - id du feedback (mode direct) ou null (mode case)
     * @param {string}      currentValue
     * @param {number|null} caseIdx     - index du cas (mode conditionnel) ou null
     */
    _renderResolverField(feedbackId, currentValue, caseIdx = null) {
        const dynamicMatch = currentValue?.match(/^GET_VOLUME_APP:(.+)$/);
        const isDynamic    = Boolean(dynamicMatch);
        const dynamicApp   = dynamicMatch?.[1] ?? '';

        const options = STATEBAR_RESOLVERS.map(r => {
            const isDynBase = r.value_action.includes('<');
            const baseKey   = isDynBase ? r.value_action.replace(/:<.*>$/, '') : r.value_action;
            const selected  = isDynamic ? isDynBase : r.value_action === currentValue;
            return `<option value="${baseKey}" data-description="${_escAttr(r.description)}" ${selected ? 'selected' : ''}>${r.value_action}</option>`;
        }).join('');

        const tooltipText = STATEBAR_RESOLVERS.find(r => {
            const baseKey = r.value_action.replace(/:<.*>$/, '');
            return isDynamic ? r.value_action.includes('<') : baseKey === currentValue;
        })?.description ?? '';

        // En mode case : data-case-param + data-case-idx pour que le save les collecte
        const isCase   = caseIdx !== null;
        const dataAttr = isCase
            ? `data-case-param="value_action" data-case-idx="${caseIdx}"`
            : `data-param="value_action" data-feedback-id="${feedbackId}"`;

        return `
            <div class="field resolver-field">
                <label>Resolver</label>
                <select ${dataAttr} class="resolver-select" title="${_escAttr(tooltipText)}">
                    <option value="">— Aucun —</option>
                    ${options}
                </select>
                <div class="resolver-app-row" style="${isDynamic ? '' : 'display:none'}">
                    <label style="font-size:10px;color:var(--text-muted)">Application (.exe)</label>
                    <input type="text" class="resolver-app-input"
                        placeholder="ex: chrome.exe"
                        value="${_escAttr(dynamicApp)}">
                </div>
                <div class="resolver-hint" title="${_escAttr(tooltipText)}">
                    ${tooltipText ? `ℹ ${tooltipText}` : ''}
                </div>
            </div>`;
    }

    // ---------------------------------------------------------------- //
    //  Mode conditionnel : cases
    // ---------------------------------------------------------------- //

    _renderCasesEditor(feedback) {
        const cases   = feedback.params.cases;
        const fid     = feedback.id;
        const hint    = VARIABLES.length
            ? `<div class="vars-hint">Variables : ${VARIABLES.map(v => `<code>${v.name}</code>`).join(', ')}</div>`
            : '<div class="vars-hint text-muted">Aucune variable définie.</div>';

        return `
            <div class="cases-editor">
                ${hint}
                ${cases.map((c, i) => this._renderCaseBlock(c, i, fid, feedback.type)).join('')}
                <button type="button" class="btn btn-sm" data-action="add-case" data-feedback-id="${fid}">+ Cas</button>
            </div>
        `;
    }

    _renderCaseBlock(caseObj, idx, feedbackId, feedbackType) {
        const isElse = caseObj.else === true;
        const params = caseObj.params ?? {};

        const conditionRow = isElse ? '' : `
            <div class="case-condition-row">
                <span class="case-if-label">Si</span>
                <input type="text" class="case-when"
                    value="${_escAttr(caseObj.when ?? '')}"
                    placeholder="ex: mute === true, mode === 'gaming'">
            </div>`;

        const paramsHtml = feedbackType === 'draw'
            ? this._renderCaseDrawParams(params, idx, feedbackId)
            : this._renderCaseLedParams(params, idx);

        return `
            <div class="case-block${isElse ? ' case-else' : ''}"
                 data-case-idx="${idx}" ${isElse ? 'data-else="true"' : ''}>
                <div class="case-block-header">
                    <span class="case-label">${isElse ? 'Sinon' : `Cas ${idx + 1}`}</span>
                    <button type="button" class="case-remove-btn"
                        data-action="remove-case"
                        data-case-idx="${idx}"
                        data-feedback-id="${feedbackId}"
                        title="Supprimer ce cas">×</button>
                </div>
                ${conditionRow}
                <div class="case-params-inner">
                    ${paramsHtml}
                </div>
            </div>
        `;
    }

    _renderCaseTargetSelector(params, caseIdx, defaultSourceType) {
        const TOUCH_KEYS  = Array.from({ length: 15 }, (_, i) => String(i));
        const BUTTON_KEYS = ['knobTL', 'knobCL', '0', '1', '2', '3'];

        const currentSourceType = params.target_source_type ?? defaultSourceType;
        const currentKeyId      = params.target_key_id ?? '';
        const keys = currentSourceType === 'touch' ? TOUCH_KEYS : BUTTON_KEYS;

        const sourceOptions = ['touch', 'buttons'].map(t =>
            `<option value="${t}" ${t === currentSourceType ? 'selected' : ''}>${t}</option>`
        ).join('');

        const keyOptions = `<option value="">— même touche —</option>` +
            keys.map(k => `<option value="${k}" ${k === currentKeyId ? 'selected' : ''}>${k}</option>`).join('');

        return `
            <div class="target-selector">
                <div class="target-selector-label">Cible</div>
                <div class="target-selector-row">
                    <select data-case-param="target_source_type" data-case-idx="${caseIdx}"
                            class="target-source-select case-target-source">
                        ${sourceOptions}
                    </select>
                    <select data-case-param="target_key_id" data-case-idx="${caseIdx}"
                            class="target-key-select case-target-key">
                        ${keyOptions}
                    </select>
                </div>
            </div>`;
    }

    _renderCaseDrawParams(params, caseIdx, feedbackId) {
        const renderer = params.renderer ?? 'fill';

        const rendererSelect = `
            <div class="field">
                <label>Renderer</label>
                <select data-case-param="renderer" data-case-idx="${caseIdx}"
                        class="case-renderer-select" data-feedback-id="${feedbackId}">
                    ${RENDERERS.map(r =>
                        `<option value="${r}" ${r === renderer ? 'selected' : ''}>${r}</option>`
                    ).join('')}
                </select>
            </div>`;

        const colorInput = (paramName, label, def) => `
            <div class="field">
                <label>${label}</label>
                <input type="color" data-case-param="${paramName}" data-case-idx="${caseIdx}"
                    value="${params[paramName] ?? def}">
            </div>`;

        const textInput = (paramName, label, def = '') => `
            <div class="field">
                <label>${label}</label>
                <input type="text" data-case-param="${paramName}" data-case-idx="${caseIdx}"
                    value="${_escAttr(String(params[paramName] ?? def))}" placeholder="${label}">
            </div>`;

        let fields = '';
        switch (renderer) {
            case 'fill':
                fields = colorInput('color', 'Couleur', '#000000');
                break;
            case 'text':
                fields = textInput('label', 'Label', 'TEXT')
                    + colorInput('color', 'Couleur texte', '#ffffff')
                    + colorInput('bg',    'Fond',          '#000000')
                    + textInput('fontSize', 'Taille police', '13')
                    + this._renderPaddingFields(params, null, caseIdx);
                break;
            case 'icon':
                fields = textInput('src', 'Fichier', '')
                    + colorInput('bg', 'Fond', '#000000')
                    + `<div class="field field-row">
                        <div class="field" style="flex:1">
                            <label>Largeur img (max 90)</label>
                            <input type="number" min="1" max="90" data-case-param="imgW" data-case-idx="${caseIdx}" value="${params.imgW ?? ''}" placeholder="auto">
                        </div>
                        <div class="field" style="flex:1">
                            <label>Hauteur img (max 90)</label>
                            <input type="number" min="1" max="90" data-case-param="imgH" data-case-idx="${caseIdx}" value="${params.imgH ?? ''}" placeholder="auto">
                        </div>
                       </div>`
                    + this._matrixPicker('imgAlign', 'Position image', params.imgAlign ?? 'mc', null, caseIdx)
                    + this._renderPaddingFields(params, null, caseIdx, 'img')
                    + textInput('text', 'Texte superposé', '')
                    + colorInput('textColor', 'Couleur texte', '#ffffff')
                    + `<div class="field">
                        <label>Taille police (px)</label>
                        <input type="number" min="6" max="72" data-case-param="fontSize" data-case-idx="${caseIdx}" value="${params.fontSize ?? 12}">
                       </div>`
                    + this._matrixPicker('textAlign', 'Position texte', params.textAlign ?? 'bc', null, caseIdx)
                    + this._renderPaddingFields(params, null, caseIdx, 'text');
                break;
            case 'statebar':
                fields = this._renderResolverField(null, params.value_action ?? '', caseIdx)
                    + this._varTextField('label',     'Label',              params.label     ?? '', null, caseIdx)
                    + this._varTextField('font_size', 'Taille police (px)', params.font_size ?? '', null, caseIdx)
                    + colorInput('color', 'Couleur barre', '#00c8ff')
                    + colorInput('bg',    'Fond',          '#1a1a1a')
                    + this._renderPaddingFields(params, null, caseIdx);
                break;
        }

        return this._renderCaseTargetSelector(params, caseIdx, 'touch') + rendererSelect + fields;
    }

    _renderCaseLedParams(params, caseIdx) {
        return this._renderCaseTargetSelector(params, caseIdx, 'buttons') + `
            <div class="field">
                <label>Couleur</label>
                <input type="color" data-case-param="color" data-case-idx="${caseIdx}"
                    value="${params.color ?? '#ffffff'}">
            </div>`;
    }

    /**
     * Champ texte avec picker de variables (insère ${varName} au curseur).
     * En mode direct  : data-param + data-feedback-id
     * En mode case    : data-case-param + data-case-idx
     */
    _varTextField(param, label, currentValue, feedbackId, caseIdx = null) {
        const isCase   = caseIdx !== null;
        const dataAttr = isCase
            ? `data-case-param="${param}" data-case-idx="${caseIdx}"`
            : `data-param="${param}" data-feedback-id="${feedbackId}"`;

        const chips = VARIABLES.map(v =>
            `<button type="button" class="var-chip" data-varname="${v.name}" title="${v.type}">\${${v.name}}</button>`
        ).join('');

        return `
            <div class="field var-text-field">
                <label>${label}</label>
                <input type="text" ${dataAttr} class="var-target"
                    value="${_escAttr(String(currentValue))}"
                    placeholder="${label}">
                ${VARIABLES.length ? `<div class="var-chips">${chips}</div>` : ''}
            </div>`;
    }

    _renderPaddingFields(p, feedbackId, caseIdx = null, prefix = '') {
        const isCase = caseIdx !== null;
        const key = s => prefix
            ? `${prefix}Pad${s[0].toUpperCase()}${s.slice(1)}`
            : `pad${s[0].toUpperCase()}${s.slice(1)}`;
        const field = (side, label) => {
            const param    = key(side);
            const dataAttr = isCase
                ? `data-case-param="${param}" data-case-idx="${caseIdx}"`
                : `data-param="${param}" data-feedback-id="${feedbackId}"`;
            return `<div class="field" style="flex:1">
                <label>${label}</label>
                <input type="number" min="0" max="90" ${dataAttr}
                    value="${p[param] ?? 0}" placeholder="0">
            </div>`;
        };
        const title = prefix === 'img' ? 'Padding image' : prefix === 'text' ? 'Padding texte' : 'Padding';
        return `
            <div class="field">
                <label>${title}</label>
                <div class="field-row" style="gap:4px">
                    ${field('top',    '↑')}
                    ${field('right',  '→')}
                    ${field('bottom', '↓')}
                    ${field('left',   '←')}
                </div>
            </div>`;
    }

    _matrixPicker(param, label, currentVal, feedbackId, caseIdx = null) {
        const isCase   = caseIdx !== null;
        const uid      = isCase ? `${param}-case-${caseIdx}` : `${param}-${feedbackId}`;
        const dataAttr = isCase
            ? `data-case-param="${param}" data-case-idx="${caseIdx}"`
            : `data-param="${param}" data-feedback-id="${feedbackId}"`;

        const POS   = ['tl','tc','tr','ml','mc','mr','bl','bc','br'];
        const ICONS = ['↖','↑','↗','←','·','→','↙','↓','↘'];

        const buttons = POS.map((p, i) =>
            `<button type="button" class="matrix-btn${p === currentVal ? ' active' : ''}"
                data-matrix-uid="${uid}" data-matrix-val="${p}" title="${p}">${ICONS[i]}</button>`
        ).join('');

        return `
            <div class="field">
                <label>${label}</label>
                <div class="matrix-grid">${buttons}</div>
                <input type="hidden" id="matrix-${uid}" ${dataAttr} value="${currentVal ?? 'mc'}">
            </div>`;
    }

    _renderAddFeedback() {
        return `
            <div class="add-feedback-row">
                <select id="select-new-feedback-type">
                    <option value="haptic">haptic</option>
                    <option value="led">led</option>
                    <option value="draw">draw</option>
                    <option value="screen">screen</option>
                    <option value="animation">animation</option>
                </select>
                <button class="btn btn-sm" id="btn-add-feedback">+ Ajouter</button>
            </div>`;
    }

    // ---------------------------------------------------------------- //
    //  Événements
    // ---------------------------------------------------------------- //

    _attachEvents() {
        // Annule tous les listeners de l'ouverture précédente pour éviter l'accumulation
        if (this._abortController) this._abortController.abort();
        this._abortController = new AbortController();
        const { signal } = this._abortController;

        const c = this.content;

        // Changement d'action → mise à jour des args (les effets sont indépendants)
        c.querySelector('#select-action')?.addEventListener('change', e => {
            const actionName = e.target.value;
            const action     = ACTIONS.find(a => a.name === actionName);
            const container  = c.querySelector('#args-container');
            container.innerHTML = this._renderArgs(action?.args ?? [], {}, action?.argTypes ?? {});
            // Auto-scan pour les champs audio-device
            container.querySelectorAll('.audio-device-field').forEach(f => this._loadAudioDevices(f));
        }, { signal });

        // Rescan périphériques audio
        c.addEventListener('click', e => {
            const btn = e.target.closest('.btn-audio-rescan');
            if (!btn) return;
            const field = btn.closest('.audio-device-field');
            if (field) this._loadAudioDevices(field);
        }, { signal });

        // Auto-scan initial si des champs audio-device sont présents
        c.querySelectorAll('.audio-device-field').forEach(f => this._loadAudioDevices(f));

        // Effets variables — ajouter une ligne
        c.querySelector('#btn-add-effect')?.addEventListener('click', () => {
            const list = c.querySelector('#effects-list');
            if (!list) return;
            const idx = list.querySelectorAll('.effect-row').length;
            list.insertAdjacentHTML('beforeend', this._renderEffectRow({}, idx));
        }, { signal });

        // Effets variables — supprimer une ligne (délégation sur le container)
        c.querySelector('#effects-container')?.addEventListener('click', e => {
            if (e.target.classList.contains('btn-effect-remove')) {
                e.target.closest('.effect-row')?.remove();
            }
        }, { signal });

        // Effets variables — afficher/masquer le champ valeur selon l'op
        c.querySelector('#effects-container')?.addEventListener('change', e => {
            if (e.target.classList.contains('effect-op')) {
                const row = e.target.closest('.effect-row');
                const val = row?.querySelector('.effect-value');
                if (val) val.style.display = e.target.value === 'toggle' ? 'none' : '';
            }
        }, { signal });

        // Sauvegarde de l'action
        c.querySelector('#btn-save-action')?.addEventListener('click', () => this._saveAction(), { signal });

        // Prévisualisation
        c.querySelector('#btn-preview-action')?.addEventListener('click', () => this._previewAction(), { signal });

        // Suppression du binding
        c.querySelector('#btn-delete-binding')?.addEventListener('click', () => this._deleteBinding(), { signal });

        // Ajout d'un feedback
        c.querySelector('#btn-add-feedback')?.addEventListener('click', () => this._addFeedback(), { signal });

        // Délégation de clics sur les feedbacks
        c.addEventListener('click', async e => {
            const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
            const btn    = e.target.closest('[data-action]') ?? e.target;

            if (action === 'save-feedback') {
                this._saveFeedback(parseInt(btn.dataset.id));
            }

            if (action === 'delete-feedback') {
                this._deleteFeedback(parseInt(btn.dataset.id));
            }

            // Bascule mode conditionnel
            if (action === 'toggle-conditional') {
                const fid      = parseInt(btn.dataset.id);
                const feedback = this._ctx.binding?.feedbacks?.find(f => f.id === fid);
                if (!feedback) return;

                let newParams;
                if (Array.isArray(feedback.params?.cases)) {
                    // Revenir en mode direct : prendre les params du 1er cas
                    newParams = { ...(feedback.params.cases[0]?.params ?? { renderer: 'fill', color: '#000000' }) };
                } else {
                    // Passer en mode conditionnel : 2 cas par défaut
                    newParams = {
                        cases: [
                            { when: '', params: { ...feedback.params } },
                            { else: true, params: { ...feedback.params } },
                        ],
                    };
                }

                try {
                    await api(`/feedbacks/${fid}`, { method: 'PUT', body: { params: newParams } });
                } catch (err) { alert(err.message); }
            }

            // Ajouter un cas
            if (action === 'add-case') {
                const fid      = parseInt(btn.dataset.feedbackId ?? btn.dataset.id);
                const feedback = this._ctx.binding?.feedbacks?.find(f => f.id === fid);
                if (!feedback) return;
                const casesEl = btn.closest('.cases-editor');
                if (!casesEl) return;
                const idx = casesEl.querySelectorAll('.case-block').length;
                const defaultParams = feedback.type === 'draw'
                    ? { renderer: feedback.params.cases?.[0]?.params?.renderer ?? 'fill', color: '#000000' }
                    : { color: '#ffffff' };
                btn.insertAdjacentHTML('beforebegin',
                    this._renderCaseBlock({ when: '', params: defaultParams }, idx, fid, feedback.type)
                );
            }

            // Supprimer un cas
            if (action === 'remove-case') {
                btn.closest('.case-block')?.remove();
                // Re-index
                c.querySelectorAll('.case-block').forEach((b, i) => {
                    b.dataset.caseIdx = i;
                    b.querySelectorAll('[data-case-idx]').forEach(el => el.dataset.caseIdx = i);
                    const label = b.querySelector('.case-label');
                    if (label && b.dataset.else !== 'true') label.textContent = `Cas ${i + 1}`;
                });
            }
        }, { signal });

        // Variable/resolver picker — suivi du dernier input focusé + insertion au curseur
        let _lastVarTarget = null;
        c.addEventListener('focusin', e => {
            if (e.target.classList.contains('var-target')) _lastVarTarget = e.target;
        }, { signal });

        const onResolverInsert = e => {
            const input = _lastVarTarget ?? c.querySelector('.var-target');
            if (!input) return;
            const insertion = `{{${e.detail.key}}}`;
            const start = input.selectionStart ?? input.value.length;
            const end   = input.selectionEnd   ?? input.value.length;
            input.value = input.value.slice(0, start) + insertion + input.value.slice(end);
            input.selectionStart = input.selectionEnd = start + insertion.length;
            input.focus();
        };
        document.addEventListener('resolver:insert', onResolverInsert, { signal });
        c.addEventListener('click', e => {
            // Matrix picker — clic sur une cellule
            const matrixBtn = e.target.closest('.matrix-btn');
            if (matrixBtn) {
                const uid = matrixBtn.dataset.matrixUid;
                const val = matrixBtn.dataset.matrixVal;
                const input = c.querySelector(`#matrix-${uid}`);
                if (input) input.value = val;
                c.querySelectorAll(`.matrix-btn[data-matrix-uid="${uid}"]`).forEach(b => {
                    b.classList.toggle('active', b.dataset.matrixVal === val);
                });
                return;
            }

            const chip = e.target.closest('.var-chip');
            if (!chip) return;
            const varName = chip.dataset.varname;
            const input   = _lastVarTarget ?? c.querySelector('.var-target');
            if (!input) return;
            const insertion = `\${${varName}}`;
            const start = input.selectionStart ?? input.value.length;
            const end   = input.selectionEnd   ?? input.value.length;
            input.value = input.value.slice(0, start) + insertion + input.value.slice(end);
            input.selectionStart = input.selectionEnd = start + insertion.length;
            input.focus();
            input.dispatchEvent(new Event('input'));
        }, { signal });

        // Resolver statebar — mise à jour tooltip + champ app dynamique
        c.addEventListener('change', e => {
            if (!e.target.classList.contains('resolver-select')) return;
            const selected = e.target.options[e.target.selectedIndex];
            const desc     = selected?.dataset.description ?? '';
            e.target.title = desc;
            const field    = e.target.closest('.resolver-field');
            if (!field) return;
            const hint     = field.querySelector('.resolver-hint');
            if (hint) { hint.textContent = desc ? `ℹ ${desc}` : ''; hint.title = desc; }
            const appRow   = field.querySelector('.resolver-app-row');
            if (appRow) appRow.style.display = e.target.value.startsWith('GET_VOLUME_APP') ? '' : 'none';
        }, { signal });

        // Re-render params quand le renderer change
        c.addEventListener('change', e => {
            // Mode conditionnel : re-render les champs du cas
            if (e.target.classList.contains('case-renderer-select')) {
                const caseBlock = e.target.closest('.case-block');
                if (!caseBlock) return;
                const caseIdx   = parseInt(caseBlock.dataset.caseIdx);
                const fid       = parseInt(e.target.dataset.feedbackId);
                const feedback  = this._ctx.binding?.feedbacks?.find(f => f.id === fid);
                if (!feedback) return;
                const paramsInner = caseBlock.querySelector('.case-params-inner');
                paramsInner.innerHTML = this._renderCaseDrawParams(
                    { renderer: e.target.value, color: '#000000' }, caseIdx, fid
                );
                return;
            }

            if (e.target.dataset.param === 'renderer') {
                const fid      = parseInt(e.target.dataset.feedbackId);
                const feedback = this._ctx.binding?.feedbacks?.find(f => f.id === fid);
                if (feedback) {
                    feedback.params.renderer = e.target.value;
                    const item = c.querySelector(`[data-feedback-id="${fid}"].feedback-item`);
                    if (item) {
                        const paramsDiv = item.querySelector('.feedback-params');
                        paramsDiv.innerHTML = this._renderFeedbackParams(feedback);
                    }
                }
            }

            // Cible dans un cas conditionnel
            if (e.target.classList.contains('case-target-source')) {
                const TOUCH_KEYS  = Array.from({ length: 15 }, (_, i) => String(i));
                const BUTTON_KEYS = ['knobTL', 'knobCL', '0', '1', '2', '3'];
                const keys     = e.target.value === 'touch' ? TOUCH_KEYS : BUTTON_KEYS;
                const keySelect = e.target.closest('.target-selector')
                    ?.querySelector('.case-target-key');
                if (keySelect) {
                    keySelect.innerHTML = `<option value="">— même touche —</option>` +
                        keys.map(k => `<option value="${k}">${k}</option>`).join('');
                }
            }

            // Mise à jour des options target_key_id quand target_source_type change
            if (e.target.dataset.param === 'target_source_type') {
                const TOUCH_KEYS  = Array.from({length: 15}, (_, i) => String(i));
                const BUTTON_KEYS = ['knobTL', 'knobCL', '0', '1', '2'];
                const keys = e.target.value === 'touch' ? TOUCH_KEYS : BUTTON_KEYS;

                const fid      = e.target.dataset.feedbackId;
                const keySelect = c.querySelector(
                    `[data-param="target_key_id"][data-feedback-id="${fid}"]`
                );
                if (keySelect) {
                    keySelect.innerHTML =
                        `<option value="">— même touche —</option>` +
                        keys.map(k => `<option value="${k}">${k}</option>`).join('');
                }
            }
        }, { signal });
    }

    // ---------------------------------------------------------------- //
    //  Actions sur les données
    // ---------------------------------------------------------------- //

    async _saveAction() {
        const { sourceType, keyId, pageId } = this._ctx;
        const action = this.content.querySelector('#select-action')?.value;
        if (!action) return;

        // Collecte les args
        const args = {};
        this.content.querySelectorAll('[id^="arg-"]').forEach(el => {
            const key = el.id.replace('arg-', '');
            if (el.value) args[key] = el.value;
        });

        // Collecte les effets variables
        const effects = [];
        this.content.querySelectorAll('.effect-row').forEach(row => {
            const name = row.querySelector('.effect-var')?.value;
            if (!name) return;
            const op  = row.querySelector('.effect-op')?.value ?? 'toggle';
            const eff = { name, op };
            if (op === 'set') {
                const raw = row.querySelector('.effect-value')?.value.trim() ?? '';
                eff.value = _parseEffectValue(raw, name);
            }
            effects.push(eff);
        });
        if (effects.length) args._effects = effects;

        try {
            await api('/bindings', {
                method: 'POST',
                body:   { pageId, sourceType, keyId: String(keyId), action, args },
            });
            await this.onSaved();

            // Rafraîchit l'éditeur avec le binding mis à jour
            const pageParam = pageId === null ? 'global' : pageId;
            // Le WS event va déclencher le rafraîchissement
        } catch (e) {
            alert(`Erreur : ${e.message}`);
        }
    }

    async _previewAction() {
        const { sourceType, keyId } = this._ctx;
        const action = this.content.querySelector('#select-action')?.value;
        if (!action) return;
        // Pour l'instant le preview ne fait rien d'extra,
        // l'action sera appliquée au prochain trigger hardware
        console.log(`Preview : ${sourceType}[${keyId}] → ${action}`);
    }

    async _deleteBinding() {
        const { binding } = this._ctx;
        if (!binding) return;
        if (!confirm('Supprimer ce binding et tous ses feedbacks ?')) return;

        try {
            await api(`/bindings/${binding.id}`, { method: 'DELETE' });
            await this.onSaved();
            this.close();
        } catch (e) {
            alert(`Erreur : ${e.message}`);
        }
    }

    async _addFeedback() {
        const { binding } = this._ctx;
        if (!binding) return;

        const type = this.content.querySelector('#select-new-feedback-type')?.value;
        if (!type) return;

        const defaults = {
            haptic: { pattern: 'SHORT_LOW' },
            led:    { color: '#ffffff' },
            draw:   { renderer: 'fill', color: '#000000' },
            screen: { scene: '' },
        };

        try {
            await api('/feedbacks', {
                method: 'POST',
                body:   { bindingId: binding.id, type, params: defaults[type] ?? {} },
            });
            await this.onSaved();
        } catch (e) {
            alert(`Erreur : ${e.message}`);
        }
    }

    async _saveFeedback(feedbackId) {
        const item = this.content.querySelector(`.feedback-item[data-feedback-id="${feedbackId}"]`);
        if (!item) return;

        let params = {};

        if (item.querySelector('.cases-editor')) {
            // Mode conditionnel : collecte les cases
            const cases = [];
            item.querySelectorAll('.case-block').forEach(block => {
                const isElse  = block.dataset.else === 'true';
                const caseObj = {};
                if (isElse) {
                    caseObj.else = true;
                } else {
                    caseObj.when = block.querySelector('.case-when')?.value?.trim() ?? '';
                }
                caseObj.params = {};
                block.querySelectorAll('[data-case-param]').forEach(el => {
                    caseObj.params[el.dataset.caseParam] = el.value;
                });
                _resolveAppParam(caseObj.params, block);
                cases.push(caseObj);
            });
            params = { cases };
        } else {
            // Mode direct : collecte les data-param normaux
            item.querySelectorAll('[data-param]').forEach(el => {
                params[el.dataset.param] = el.value;
            });
            // Resolver dynamique : concatène l'app si nécessaire
            _resolveAppParam(params, item);
        }

        try {
            await api(`/feedbacks/${feedbackId}`, {
                method: 'PUT',
                body:   { params },
            });
        } catch (e) {
            alert(`Erreur : ${e.message}`);
        }
    }

    async _deleteFeedback(feedbackId) {
        if (!confirm('Supprimer ce feedback ?')) return;
        try {
            await api(`/feedbacks/${feedbackId}`, { method: 'DELETE' });
            await this.onSaved();
        } catch (e) {
            alert(`Erreur : ${e.message}`);
        }
    }
}

function _resolveAppParam(params, container) {
    if (!params.value_action?.startsWith('GET_VOLUME_APP')) return;
    const appInput = container.querySelector('.resolver-app-input');
    const app = appInput?.value.trim();
    params.value_action = app ? `GET_VOLUME_APP:${app}` : '';
}

function _escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function _parseEffectValue(raw, varName) {
    if (raw === '' || raw === 'null') return null;
    const v = VARIABLES.find(v => v.name === varName);
    if (v?.type === 'boolean') return raw === 'true' || raw === '1';
    if (v?.type === 'number')  return Number(raw);
    return raw;
}