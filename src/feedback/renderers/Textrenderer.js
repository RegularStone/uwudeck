// src/feedback/renderers/TextRenderer.js
import { logger } from '../../utils/logger.js';

/**
 * TextRenderer
 * Affiche un label texte centré sur une touche tactile.
 *
 * params : {
 *   renderer  : 'text',
 *   label     : 'MUTE',        // texte affiché
 *   color     : '#FFFFFF',     // couleur du texte
 *   bg        : '#FF0000',     // couleur de fond
 *   fontSize  : 14,            // taille en px (défaut 13)
 *   padTop    : 0,             // padding en px
 *   padRight  : 0,
 *   padBottom : 0,
 *   padLeft   : 0,
 * }
 */
export class TextRenderer {
    constructor(device) {
        this.device = device;
    }

    async draw(keyIndex, params) {
        const {
            label    = '',
            color    = '#FFFFFF',
            bg       = '#000000',
            fontSize = 13,
        } = params;
        const { top, right, bottom, left } = _parsePadding(params);

        await this.device.drawKey(keyIndex, (ctx, width, height) => {
            // Fond
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);

            // Texte centré dans la zone utile
            const cx = left + (width  - left - right)  / 2;
            const cy = top  + (height - top  - bottom) / 2;
            ctx.fillStyle    = color;
            ctx.font         = `bold ${fontSize}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx, cy);
        });

        logger.debug(`TextRenderer : touch ${keyIndex} → "${label}"`);
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