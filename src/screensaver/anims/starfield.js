// src/screensaver/anims/starfield.js
//
// Champ d'étoiles en warp speed. Chaque étoile a une profondeur Z
// qui diminue à chaque frame → elle s'éloigne du centre vers les bords.
// Vitesse, taille et luminosité dépendent de Z.

const FRAME_MS   = 33;  // ~30 fps
const CYCLE_LEN  = 150; // frames (~5s)
const STAR_COUNT = 250;
const SPEED      = 8;   // px de Z consommés par frame (plus = plus rapide)

function initStars(count, W, H) {
    return Array.from({ length: count }, () => newStar(W, H, true));
}

function newStar(W, H, spread = false) {
    return {
        x:  (Math.random() - 0.5) * W,
        y:  (Math.random() - 0.5) * H,
        z:  spread ? Math.random() * W : W,   // spread = réparti à toutes profondeurs au démarrage
        pz: null,  // z précédent (pour tracer le sillage)
    };
}

export class Starfield {
    constructor(device) {
        this.device  = device;
        this._stars  = null;
        this._W      = 0;
        this._H      = 0;
    }

    async runOnce(signal = { cancelled: false }, oneShot = false) {
        for (let t = 0; t < CYCLE_LEN; t++) {
            if (signal.cancelled) return;

            await this.device.drawScreen('center', (ctx, W, H) => {
                if (!this._stars) {
                    this._W     = W;
                    this._H     = H;
                    this._stars = initStars(STAR_COUNT, W, H);
                }

                const cx = W / 2;
                const cy = H / 2;

                // Fond noir semi-transparent pour laisser un léger sillage
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillRect(0, 0, W, H);

                for (const star of this._stars) {
                    star.pz = star.z;
                    star.z -= SPEED;

                    if (star.z <= 0) {
                        Object.assign(star, newStar(W, H));
                        continue;
                    }

                    // Projection perspective
                    const sx = (star.x / star.z) * W + cx;
                    const sy = (star.y / star.z) * H + cy;

                    // Position précédente (pour le sillage)
                    const px = (star.x / star.pz) * W + cx;
                    const py = (star.y / star.pz) * H + cy;

                    // Hors écran → réinitialise
                    if (sx < 0 || sx > W || sy < 0 || sy > H) {
                        Object.assign(star, newStar(W, H));
                        continue;
                    }

                    // Plus proche = plus lumineux et plus gros
                    const brightness = Math.floor(255 * (1 - star.z / W));
                    const size       = Math.max(0.5, (1 - star.z / W) * 3);

                    ctx.strokeStyle = `rgb(${brightness},${brightness},${brightness})`;
                    ctx.lineWidth   = size;
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(sx, sy);
                    ctx.stroke();
                }
            });

            await this._sleep(FRAME_MS, signal);
        }

        if (oneShot) await this._blackout(signal);
    }

    async _blackout(signal) {
        if (signal.cancelled) return;
        this._stars = null; // reset pour le prochain one-shot
        await this.device.drawScreen('center', (ctx, W, H) => {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
        });
    }

    _sleep(ms, signal) {
        return new Promise(resolve => {
            if (signal) signal._resolve = resolve;
            setTimeout(() => {
                if (signal) signal._resolve = null;
                resolve();
            }, ms);
        });
    }
}
