// src/web/public/components/Grid.js

export class Grid {
    /**
     * @param {HTMLElement} container  - Le div#touch-grid
     * @param {Function}    onSelect   - (sourceType, keyId) => void
     */
    constructor(container, onSelect) {
        this.container = container;
        this.onSelect  = onSelect;
        this._build();
    }

    // Construit les 15 cases une fois
    _build() {
        this.container.innerHTML = '';
        for (let i = 0; i < 15; i++) {
            const key = document.createElement('div');
            key.className      = 'touch-key';
            key.dataset.source = 'touch';
            key.dataset.id     = String(i);

            key.innerHTML = `
                <span class="key-index">${i}</span>
                <span class="key-action">—</span>
                <div class="key-feedback-dots"></div>
            `;

            key.addEventListener('click', () => this.onSelect('touch', String(i)));
            this.container.appendChild(key);
        }
    }

    /**
     * Met à jour l'affichage de toutes les cases à partir des bindings.
     * @param {Array} bindings - bindings de la page courante (avec .feedbacks)
     */
    render(bindings) {
        // Index rapide : keyId → binding
        const map = {};
        for (const b of bindings) {
            if (b.source_type === 'touch') map[b.key_id] = b;
        }

        this.container.querySelectorAll('.touch-key').forEach(el => {
            const keyId   = el.dataset.id;
            const binding = map[keyId] ?? null;

            const actionEl   = el.querySelector('.key-action');
            const dotsEl     = el.querySelector('.key-feedback-dots');

            if (binding) {
                el.classList.add('has-binding');
                // Nom court de l'action (ex: "VOLUME_SYSTEM_ROTATE" → "VOL SYS")
                actionEl.textContent = shortName(binding.action);
                actionEl.title       = binding.action;

                // Points de feedback
                dotsEl.innerHTML = '';
                const types = [...new Set((binding.feedbacks ?? []).map(f => f.type))];
                for (const type of types) {
                    const dot = document.createElement('div');
                    dot.className = `feedback-dot ${type}`;
                    dot.title     = type;
                    dotsEl.appendChild(dot);
                }
            } else {
                el.classList.remove('has-binding');
                actionEl.textContent = '—';
                actionEl.removeAttribute('title');
                dotsEl.innerHTML = '';
            }
        });
    }
}

// Raccourcit un nom d'action pour l'affichage dans la grille
function shortName(action) {
    return action
        .replace('VOLUME', 'VOL')
        .replace('SYSTEM', 'SYS')
        .replace('ROTATE', '')
        .replace('TOGGLE', '')
        .replace('_APP_',  ' ')
        .replace(/_/g, ' ')
        .trim()
        .substring(0, 12);
}