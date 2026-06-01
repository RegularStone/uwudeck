// src/screensaver/anims/plasma.js
//
// Plasma classique : grille de cellules colorées via combinaison
// de 4 ondes sinusoïdales. Chaque cellule calcule une valeur [-4, 4]
// mappée sur la teinte HSL. Résultat : flux de couleurs organique et fluide.

const FRAME_MS  = 50;   // ~20 fps
const CYCLE_LEN = 120;  // frames (~6s)
const CELL      = 4;    // px par cellule

export class Plasma {
    constructor(device) {
        this.device = device;
    }

    async runOnce(signal = { cancelled: false }, oneShot = false) {
        for (let t = 0; t < CYCLE_LEN; t++) {
            if (signal.cancelled) return;

            const time = t * 0.07;

            await this.device.drawScreen('center', (ctx, W, H) => {
                const GW = Math.ceil(W / CELL);
                const GH = Math.ceil(H / CELL);

                for (let gy = 0; gy < GH; gy++) {
                    for (let gx = 0; gx < GW; gx++) {
                        // Coordonnées normalisées centrées
                        const x = gx / GW;
                        const y = gy / GH;

                        // 4 ondes combinées — formule plasma classique
                        const v = Math.sin(x * 8  + time)
                                + Math.sin(y * 6  + time * 1.3)
                                + Math.sin((x + y) * 5 + time * 0.9)
                                + Math.sin(Math.sqrt(
                                      (x - 0.5) * (x - 0.5) +
                                      (y - 0.5) * (y - 0.5)
                                  ) * 12 + time * 1.5);

                        // v ∈ [-4, 4] → hue [0, 360]
                        const hue   = ((v + 4) / 8) * 360;
                        const light = 45 + 15 * Math.sin(v * 1.2);

                        ctx.fillStyle = `hsl(${hue.toFixed(1)}, 100%, ${light.toFixed(1)}%)`;
                        ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
                    }
                }
            });

            await this._sleep(FRAME_MS, signal);
        }

        if (oneShot) await this._blackout(signal);
    }

    async _blackout(signal) {
        if (signal.cancelled) return;
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
