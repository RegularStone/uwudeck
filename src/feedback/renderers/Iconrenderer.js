// src/feedback/renderers/IconRenderer.js
import { loadImage } from 'canvas';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

const ICONS_DIR = join(process.cwd(), 'src', 'assets', 'icons');
const MAX_IMG   = 90;

/**
 * IconRenderer
 * Affiche une image (PNG/JPG) sur une touche tactile, avec texte superposé optionnel.
 *
 * params : {
 *   renderer  : 'icon',
 *   src       : 'mute.png',   // fichier relatif à src/assets/icons/ (optionnel si text seul)
 *   bg        : '#000000',
 *   fit       : 'contain' | 'cover' | 'stretch'
 *   imgW      : number,        // largeur cible (max 90)
 *   imgH      : number,        // hauteur cible (max 90)
 *   imgAlign    : 'tl'|'tc'|'tr'|'ml'|'mc'|'mr'|'bl'|'bc'|'br'  (défaut: 'mc')
 *   text        : string,        // texte superposé (optionnel)
 *   textColor   : '#ffffff',
 *   fontSize    : number,        // px (défaut: 12)
 *   textAlign   : 'tl'|'tc'|…   (défaut: 'bc')
 *   imgPadTop   : 0,             // padding image en px
 *   imgPadRight : 0,
 *   imgPadBottom: 0,
 *   imgPadLeft  : 0,
 *   textPadTop  : 0,             // padding texte en px
 *   textPadRight: 0,
 *   textPadBottom:0,
 *   textPadLeft : 0,
 * }
 */
export class IconRenderer {
    constructor(device) {
        this.device = device;
        this._cache = new Map();
    }

    async draw(keyIndex, params) {
        const {
            src       = null,
            bg        = '#000000',
            fit       = 'contain',
            imgW      = null,
            imgH      = null,
            imgAlign  = 'mc',
            text      = '',
            textColor = '#ffffff',
            fontSize  = 12,
            textAlign = 'bc',
        } = params;
        const imgPad  = _parsePadding(params, 'img');
        const textPad = _parsePadding(params, 'text');

        let img = null;

        if (src) {
            const iconPath = join(ICONS_DIR, src);
            if (!existsSync(iconPath)) {
                logger.warn(`IconRenderer : icône introuvable "${iconPath}"`);
            } else {
                img = this._cache.get(src);
                if (!img) {
                    try {
                        img = await loadImage(iconPath);
                        this._cache.set(src, img);
                    } catch (err) {
                        logger.error(`IconRenderer : impossible de charger "${src}" : ${err.message}`);
                        img = null;
                    }
                }
            }
        }

        if (!img && !text) {
            logger.warn(`IconRenderer : rien à afficher pour touch ${keyIndex}`);
            return;
        }

        await this.device.drawKey(keyIndex, (ctx, width, height) => {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);

            if (img) {
                const iaW = width  - imgPad.left - imgPad.right;
                const iaH = height - imgPad.top  - imgPad.bottom;
                const clampW = imgW ? Math.min(Number(imgW), MAX_IMG) : null;
                const clampH = imgH ? Math.min(Number(imgH), MAX_IMG) : null;

                let dw, dh;
                if (clampW && clampH) {
                    dw = clampW; dh = clampH;
                } else if (fit === 'stretch') {
                    dw = clampW ?? iaW; dh = clampH ?? iaH;
                } else if (fit === 'cover') {
                    const maxW = clampW ?? iaW, maxH = clampH ?? iaH;
                    const scale = Math.max(maxW / img.width, maxH / img.height);
                    dw = img.width * scale; dh = img.height * scale;
                } else {
                    const maxW = clampW ?? iaW, maxH = clampH ?? iaH;
                    const scale = Math.min(maxW / img.width, maxH / img.height);
                    dw = img.width * scale; dh = img.height * scale;
                }

                const { x: dx, y: dy } = _alignPos(imgAlign, iaW, iaH, dw, dh);
                ctx.drawImage(img, imgPad.left + dx, imgPad.top + dy, dw, dh);
            }

            if (text) {
                const taW = width  - textPad.left - textPad.right;
                const taH = height - textPad.top  - textPad.bottom;
                const fs = Math.max(8, Number(fontSize) || 12);
                ctx.font      = `bold ${fs}px sans-serif`;
                ctx.fillStyle = textColor;
                const { x, y, hAlign, vBaseline } = _textPos(textAlign, taW, taH, fs);
                ctx.textAlign    = hAlign;
                ctx.textBaseline = vBaseline;
                ctx.fillText(String(text), textPad.left + x, textPad.top + y);
            }
        });

        logger.debug(`IconRenderer : touch ${keyIndex} → src="${src}" text="${text}"`);
    }

    clearCache() {
        this._cache.clear();
    }
}

function _parsePadding(params, prefix = '') {
    const k = s => prefix ? `${prefix}Pad${s.charAt(0).toUpperCase()}${s.slice(1)}` : `pad${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    return {
        top:    Number(params[k('top')])    || 0,
        right:  Number(params[k('right')])  || 0,
        bottom: Number(params[k('bottom')]) || 0,
        left:   Number(params[k('left')])   || 0,
    };
}

// Retourne le coin supérieur-gauche pour placer un rectangle de taille (iw×ih)
// dans un conteneur (cw×ch) selon un code d'alignement 2 lettres (ex: 'mc', 'tl').
function _alignPos(align, cw, ch, iw, ih) {
    const hFactor = { l: 0, c: 0.5, r: 1 };
    const vFactor = { t: 0, m: 0.5, b: 1 };
    return {
        x: (cw - iw) * (hFactor[align[1]] ?? 0.5),
        y: (ch - ih) * (vFactor[align[0]] ?? 0.5),
    };
}

// Retourne les coordonnées + attributs canvas pour dessiner du texte positionné.
function _textPos(align, cw, ch, fs) {
    const PAD = 4;
    const hKey = align[1] ?? 'c';
    const vKey = align[0] ?? 'b';
    const xMap      = { l: PAD,     c: cw / 2,   r: cw - PAD };
    const yMap      = { t: PAD,     m: ch / 2,   b: ch - PAD };
    const hAlignMap = { l: 'left',  c: 'center', r: 'right' };
    const baseMap   = { t: 'top',   m: 'middle', b: 'bottom' };
    return {
        x: xMap[hKey]  ?? cw / 2,
        y: yMap[vKey]  ?? ch - PAD,
        hAlign:    hAlignMap[hKey] ?? 'center',
        vBaseline: baseMap[vKey]   ?? 'bottom',
    };
}