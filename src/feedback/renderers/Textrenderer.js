// src/feedback/renderers/TextRenderer.js
import { logger } from '../../utils/logger.js';

/**
 * TextRenderer
 * Affiche un label texte centré sur une touche tactile.
 *
 * params : {
 *   renderer : 'text',
 *   label    : 'MUTE',        // texte affiché
 *   color    : '#FFFFFF',     // couleur du texte
 *   bg       : '#FF0000',     // couleur de fond
 *   fontSize : 14             // taille en px (défaut 13)
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

        await this.device.drawKey(keyIndex, (ctx, width, height) => {
            // Fond
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);

            // Texte centré
            ctx.fillStyle   = color;
            ctx.font        = `bold ${fontSize}px sans-serif`;
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, width / 2, height / 2);
        });

        logger.debug(`TextRenderer : touch ${keyIndex} → "${label}"`);
    }
}