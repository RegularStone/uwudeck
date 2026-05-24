import fs from 'fs';
import path from 'path';

const logFile = path.join(process.cwd(), 'loupedeck.log');
const isDebugMode = true;

function writeLog(niveau, message) {
    if (!isDebugMode) {
        return true;
    }

    const date = new Date().toISOString();
    const fileRow = `[${date}] [${niveau}] ${message}\n`;

    switch(niveau) {
        case 'INFO':    console.log(`🔵 [INFO] ${message}`); break;
        case 'SUCCESS': console.log(`🟢 [SUCCESS] ${message}`); break;
        case 'ERROR':   console.error(`🔴 [ERROR] ${message}`); break;
        case 'LOG':     console.log(`⚪ [LOG] ${message}`); break;
        case 'WARN':    console.warn(`🟠 [WARN] ${message}`); break;
        case 'DEBUG':   console.debug(`🟣 [DEBUG] ${message}`); break;
        default:        console.log(`[${niveau}] ${message}`); break;
    }
    fs.appendFile(logFile, fileRow, (err) => {
        if (err) console.error("⚠️ Impossible d'écrire dans le fichier de log :", err);
    });
}

export const logger = {
    info: (msg) => writeLog('INFO', msg),
    success: (msg) => writeLog('SUCCESS', msg),
    error: (msg) => writeLog('ERROR', msg),
    log: (msg) => writeLog('LOG', msg),
    warn: (msg) => writeLog('WARN', msg),
    debug: (msg) => writeLog('DEBUG', msg),
    forceLogSync: (niveau, msg) => {
        if (!isDebugMode) return true;

        const date = new Date().toISOString();
        const fileRow = `[${date}] [${niveau}] ${msg}\n`;
        
        console.log(`⚪ [${niveau}] ${msg}`);
        try {
            fs.appendFileSync(logFile, fileRow);
        } catch (err) {
            console.error("⚠️ Erreur lors du log de fermeture :", err);
        }
    }
};