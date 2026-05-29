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
 *   bg            : '#111111',            // fond de la barre
 *   bg_key        : '#000000',            // fond de la touche
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
            bg_key       = '#000000',
        } = params;

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
            // Fond de la touche
            ctx.fillStyle = bg_key;
            ctx.fillRect(0, 0, width, height);

            // Zone de la barre (centrée, marges de 4px)
            const margin  = 4;
            const barX    = margin;
            const barW    = width - margin * 2;
            const labelH  = label ? 18 : 0;
            const barY    = margin + labelH;
            const barH    = height - margin * 2 - labelH;

            // Fond de la barre
            ctx.fillStyle   = bg;
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

            // Pourcentage
            const pct = Math.round(value * 100);
            ctx.fillStyle    = '#FFFFFF';
            ctx.font         = `bold 10px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${pct}%`, width / 2, fillY > barY + 8 ? fillY - 7 : barY + barH / 2);

            // Label en haut
            if (label) {
                ctx.fillStyle    = '#AAAAAA';
                ctx.font         = `10px sans-serif`;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, width / 2, margin + labelH / 2);
            }
        });

        logger.debug(`StateBarRenderer : touch ${keyIndex} → ${Math.round(value * 100)}% (${value_action})`);
    }
}