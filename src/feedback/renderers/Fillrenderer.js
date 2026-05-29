// src/feedback/renderers/FillRenderer.js
import { logger } from '../../utils/logger.js';

/**
 * FillRenderer
 * Remplit une touche tactile d'une couleur unie.
 *
 * params : { renderer: 'fill', color: '#FF0000' }
 */
export class FillRenderer {
    constructor(device) {
        this.device = device;
    }

    async draw(keyIndex, params) {
        const { color = '#000000' } = params;

        await this.device.drawKey(keyIndex, (ctx, width, height) => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, width, height);
        });

        logger.debug(`FillRenderer : touch ${keyIndex} → ${color}`);
    }
}