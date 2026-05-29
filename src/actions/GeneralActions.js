import { exec } from 'child_process';
import { logger } from '../utils/logger.js';

export class GeneralActions {
    constructor(device) {
        this.device = device;
    }

    openPath(path) {
        if (!path) {
            logger.warn('OPEN_PATH : aucun chemin fourni');
            return;
        }

        // Les URLs (protocoles custom) ne doivent pas être entre guillemets sous Windows
        const isUrl = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(path);
        const cmd = process.platform === 'win32'
            ? (isUrl ? `start "" ${path}` : `start "" "${path}"`)
            : process.platform === 'darwin'
                ? `open "${path}"`
                : `xdg-open "${path}"`;

        exec(cmd, (err) => {
            if (err) logger.warn(`OPEN_PATH échoué (${path}) : ${err.message}`);
            else      logger.info(`OPEN_PATH → ${path}`);
        });
    }
}