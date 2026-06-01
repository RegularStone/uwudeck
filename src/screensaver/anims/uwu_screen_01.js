// src/screensaver/anims/uwu_screen_01.js

const DELAY       = 200;
const FLASH_DELAY = 500;
const COLOR_U     = '#FF69B4';
const COLOR_W     = '#8A2BE2';
const COLOR_OFF   = '#000000';

// Grille 3x5
//  0  1  2  3  4
//  5  6  7  8  9
// 10 11 12 13 14

const FRAMES = [
    { keys: [0,2,4],                 label: 'U', color: COLOR_U },
    { keys: [5,7,9],                 label: 'W', color: COLOR_W },
    { keys: [10,12,14],              label: 'U', color: COLOR_U },
    { keys: [5,7,9],                 label: 'W', color: COLOR_W },
    { keys: [0,2,4],                 label: 'U', color: COLOR_U },
    { keys: [0,2,4,5,7,9,10,12,14], label: '✦', color: COLOR_U, delay: FLASH_DELAY },
];

// Colonnes diagonales "/" de haut-gauche à bas-droite
const DIAGONAL_COLUMNS = [
    [0],
    [1, 5],
    [2, 6, 10],
    [3, 7, 11],
    [4, 8, 12],
    [9, 13],
    [14],
];

export class UwuScreen01 {
    constructor(device) {
        this.device = device;
    }

    /**
     * Joue un cycle complet (frames + diagonale).
     * Reçoit un signal d'annulation via { cancelled } pour le one-shot.
     */
    async runOnce(signal = { cancelled: false }) {
        for (const frame of FRAMES) {
            if (signal.cancelled) return;
            await this._clearAll(signal);
            await this._drawKeys(frame.keys, frame.label, frame.color, signal);
            await this._sleep(frame.delay ?? DELAY, signal);
        }

        for (const col of DIAGONAL_COLUMNS) {
            if (signal.cancelled) return;
            await this._clearAll(signal);
            for (const key of col) {
                if (signal.cancelled) return;
                const label = [0,2,4].includes(key) || [10,12,14].includes(key) ? 'U' : 'W';
                await this._drawKey(key, label, label === 'U' ? COLOR_U : COLOR_W);
            }
            await this._sleep(DELAY, signal);
        }

        await this._clearAll(signal);
    }

    async _clearAll(signal) {
        for (let i = 0; i < 15; i++) {
            if (signal?.cancelled) return;
            await this.device.drawKey(i, (ctx, w, h) => {
                ctx.fillStyle = COLOR_OFF;
                ctx.fillRect(0, 0, w, h);
            });
        }
    }

    async _drawKeys(keys, label, color, signal) {
        for (const k of keys) {
            if (signal?.cancelled) return;
            await this._drawKey(k, label, color);
        }
    }

    async _drawKey(key, label, color) {
        await this.device.drawKey(key, (ctx, w, h) => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle    = '#FFFFFF';
            ctx.font         = `bold ${Math.floor(h * 0.45)}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, w / 2, h / 2);
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
