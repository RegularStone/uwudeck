// src/feedback/renderers/StateBarRenderer.js
import { logger } from '../../utils/logger.js';

/**
 * StateBarRenderer
 * Affiche une barre de progression verticale représentant un état (volume, etc.).
 * La valeur courante est récupérée dynamiquement via un "value resolver".
 *
 * params : {
 *   renderer      : 'statebar',
 *   value_action  : 'GET_VOLUME_SYSTEM',  // clé du resolver enregistré
 *   label         : 'VOL',                // texte affiché au-dessus de la barre
 *   color         : '#00FF00',            // couleur de la barre remplie
 *   color_low     : '#FF4444',            // couleur quand valeur < 20% (optionnel)
 *   bg            : '#111111',            // fond de la touche ET de la barre vide
 *   font_size     : 12,                   // taille police (optionnel, auto-fit par défaut)
 *   padTop        : 0,                    // padding en px
 *   padRight      : 0,
 *   padBottom     : 0,
 *   padLeft       : 0,
 * }
 *
 * Enregistrement d'un resolver :
 *   stateBarRenderer.registerResolver('GET_VOLUME_SYSTEM', () => audioActions.getSystemVolume())
 */
export class StateBarRenderer {
    constructor(device) {
        this.device    = device;
        this._resolvers = new Map();
    }

    /**
     * Enregistre une fonction qui retourne une valeur entre 0 et 1.
     * @param {string}   name     - Clé utilisée dans le JSON (value_action)
     * @param {Function} resolver - () => number (0.0 – 1.0)
     */
    registerResolver(name, resolver) {
        this._resolvers.set(name, resolver);
        logger.debug(`StateBarRenderer : resolver "${name}" enregistré`);
    }

    async draw(keyIndex, params) {
        const {
            value_action = null,
            label        = '',
            color        = '#00C8FF',
            color_low    = null,
            bg           = '#1A1A1A',
            font_size    = null,
        } = params;
        const pad = _parsePadding(params);

        // Récupération de la valeur (0–1)
        let value = 0;
        if (value_action) {
            const resolver = this._resolvers.get(value_action);
            if (resolver) {
                try {
                    value = Math.max(0, Math.min(1, await resolver()));
                } catch (err) {
                    logger.warn(`StateBarRenderer : resolver "${value_action}" échoué : ${err.message}`);
                }
            } else {
                logger.warn(`StateBarRenderer : resolver "${value_action}" non trouvé`);
            }
        }

        await this.device.drawKey(keyIndex, (ctx, width, height) => {
            // Fond de la touche (même couleur que fond de barre)
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);

            // Zone de la barre (padding utilisateur + marge interne minimale)
            const margin  = 4;
            const barX    = pad.left   + margin;
            const barW    = width  - pad.left - pad.right  - margin * 2;
            const labelH  = label ? 16 : 0;
            const barY    = pad.top    + margin + labelH;
            const barH    = height - pad.top - pad.bottom - margin * 2 - labelH;

            // Fond de la barre (légèrement plus sombre pour la distinguer du fond)
            ctx.fillStyle = _darken(bg, 0.6);
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 3);
            ctx.fill();

            // Remplissage
            const fillH    = Math.floor(barH * value);
            const fillY    = barY + barH - fillH;
            const barColor = (color_low && value < 0.2) ? color_low : color;

            if (fillH > 0) {
                ctx.fillStyle = barColor;
                ctx.beginPath();
                ctx.roundRect(barX, fillY, barW, fillH, 3);
                ctx.fill();
            }

            // Pourcentage — taille auto-fit ou imposée
            const pct      = Math.round(value * 100);
            const pctText  = `${pct}%`;
            const pctSize  = font_size ? parseInt(font_size) : _fitFontSize(ctx, pctText, barW - 4, 14, 7, 'bold');
            ctx.fillStyle    = '#FFFFFF';
            ctx.font         = `bold ${pctSize}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            const pctY = barY + barH / 2;
            ctx.fillText(pctText, width / 2, pctY);

            // Label en haut
            if (label) {
                const lblSize = font_size ? Math.max(7, parseInt(font_size) - 2) : _fitFontSize(ctx, label, barW - 2, 11, 7, '');
                ctx.fillStyle    = '#AAAAAA';
                ctx.font         = `${lblSize}px sans-serif`;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, pad.left + margin + barW / 2, pad.top + margin + labelH / 2);
            }
        });

        logger.debug(`StateBarRenderer : touch ${keyIndex} → ${Math.round(value * 100)}% (${value_action})`);
    }
}

function _parsePadding({ padTop = 0, padRight = 0, padBottom = 0, padLeft = 0 }) {
    return {
        top:    Number(padTop)    || 0,
        right:  Number(padRight)  || 0,
        bottom: Number(padBottom) || 0,
        left:   Number(padLeft)   || 0,
    };
}

function _darken(hex, factor) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.round(((n >> 16) & 0xff) * factor);
    const g = Math.round(((n >> 8)  & 0xff) * factor);
    const b = Math.round(( n        & 0xff) * factor);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function _fitFontSize(ctx, text, maxWidth, preferred, min, weight) {
    let size = preferred;
    ctx.font = `${weight ? weight + ' ' : ''}${size}px sans-serif`;
    while (size > min && ctx.measureText(text).width > maxWidth) {
        size--;
        ctx.font = `${weight ? weight + ' ' : ''}${size}px sans-serif`;
    }
    return size;
}