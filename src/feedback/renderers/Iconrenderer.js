// src/feedback/renderers/IconRenderer.js
import { createCanvas, loadImage } from 'canvas';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

// Dossier de recherche des icônes
const ICONS_DIR = join(process.cwd(), 'src', 'assets', 'icons');

/**
 * IconRenderer
 * Affiche une image (PNG/JPG) sur une touche tactile.
 *
 * params : {
 *   renderer : 'icon',
 *   src      : 'mute.png',    // nom de fichier relatif à src/assets/icons/
 *   bg       : '#000000',     // couleur de fond si l'image est transparente
 *   fit      : 'contain'      // 'contain' | 'cover' | 'stretch' (défaut: 'contain')
 * }
 */
export class IconRenderer {
    constructor(device) {
        this.device = device;
        this._cache = new Map(); // Cache des images déjà chargées
    }

    async draw(keyIndex, params) {
        const {
            src = null,
            bg  = '#000000',
            fit = 'contain',
        } = params;

        if (!src) {
            logger.warn(`IconRenderer : paramètre "src" manquant pour touch ${keyIndex}`);
            return;
        }

        const iconPath = join(ICONS_DIR, src);

        if (!existsSync(iconPath)) {
            logger.warn(`IconRenderer : icône introuvable "${iconPath}"`);
            return;
        }

        // Chargement avec cache
        let image = this._cache.get(src);
        if (!image) {
            try {
                image = await loadImage(iconPath);
                this._cache.set(src, image);
            } catch (err) {
                logger.error(`IconRenderer : impossible de charger "${src}" : ${err.message}`);
                return;
            }
        }

        const img = image; // capture pour la closure canvas

        await this.device.drawKey(keyIndex, (ctx, width, height) => {
            // Fond
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);

            // Calcul de la position selon le mode fit
            let dx, dy, dw, dh;

            if (fit === 'stretch') {
                dx = 0; dy = 0; dw = width; dh = height;

            } else if (fit === 'cover') {
                const scale = Math.max(width / img.width, height / img.height);
                dw = img.width  * scale;
                dh = img.height * scale;
                dx = (width  - dw) / 2;
                dy = (height - dh) / 2;

            } else {
                // contain (défaut)
                const scale = Math.min(width / img.width, height / img.height);
                dw = img.width  * scale;
                dh = img.height * scale;
                dx = (width  - dw) / 2;
                dy = (height - dh) / 2;
            }

            ctx.drawImage(img, dx, dy, dw, dh);
        });

        logger.debug(`IconRenderer : touch ${keyIndex} → "${src}" (fit=${fit})`);
    }

    /**
     * Vide le cache d'images (utile si les assets changent à chaud).
     */
    clearCache() {
        this._cache.clear();
    }
}