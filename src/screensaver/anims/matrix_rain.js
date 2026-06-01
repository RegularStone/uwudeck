// src/screensaver/anims/matrix_rain.js

const FRAME_MS  = 50;
const CYCLE_LEN = 100; // frames par cycle (~5s)

const FONT_SIZE = 14;
const COL_W     = 14;
const ROW_H     = 16;

const CHARS = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';

function rndChar() {
    return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function initColumns(cols, rows) {
    return Array.from({ length: cols }, () => ({
        head:   -(2 + Math.random() * rows),
        speed:  0.4 + Math.random() * 0.8,
        length: 6  + Math.floor(Math.random() * 12),
        chars:  Array.from({ length: rows }, rndChar),
    }));
}

export class MatrixRain {
    constructor(device) {
        this.device  = device;
        this._cols   = null; // état persistant entre les cycles
        this._COLS   = 0;
        this._ROWS   = 0;
    }

    /**
     * @param {object}  signal
     * @param {boolean} oneShot — si true, blackout à la fin (feedback) ; sinon boucle seamless
     */
    async runOnce(signal = { cancelled: false }, oneShot = false) {
        for (let t = 0; t < CYCLE_LEN; t++) {
            if (signal.cancelled) return;

            await this.device.drawScreen('center', (ctx, W, H) => {
                // Init une seule fois pour toute la durée de vie de l'instance
                if (!this._cols) {
                    this._COLS = Math.floor(W / COL_W);
                    this._ROWS = Math.floor(H / ROW_H);
                    this._cols = initColumns(this._COLS, this._ROWS);
                }
                const columns = this._cols;
                const COLS = this._COLS;
                const ROWS = this._ROWS;

                // Traîne : fond noir semi-transparent → les anciens chars s'estompent naturellement
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.fillRect(0, 0, W, H);

                ctx.font         = `bold ${FONT_SIZE}px monospace`;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';

                for (let c = 0; c < COLS; c++) {
                    const col  = columns[c];
                    const head = Math.floor(col.head);
                    const x    = c * COL_W + COL_W / 2;

                    // Rafraîchit un char aléatoire dans le trail
                    if (Math.random() < 0.15) {
                        const r = Math.floor(Math.random() * ROWS);
                        col.chars[r] = rndChar();
                    }

                    // Dessine uniquement la tête et les quelques chars juste derrière
                    for (let r = Math.max(0, head - col.length); r <= Math.min(ROWS - 1, head); r++) {
                        const dist = head - r;
                        const y    = r * ROW_H;

                        if (dist === 0) {
                            ctx.fillStyle = '#CCFFCC'; // tête : vert très clair
                        } else {
                            const fade    = 1 - dist / col.length;
                            const bright  = Math.floor(220 * fade * fade);
                            ctx.fillStyle = `rgb(0, ${bright}, 0)`;
                        }

                        ctx.fillText(col.chars[r], x, y);
                    }

                    // Avance la tête
                    col.head += col.speed;

                    // Reset quand la colonne est sortie
                    if (col.head - col.length > ROWS) {
                        col.head   = -(2 + Math.random() * 6);
                        col.speed  = 0.4 + Math.random() * 0.8;
                        col.length = 6 + Math.floor(Math.random() * 12);
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
