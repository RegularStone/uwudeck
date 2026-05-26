import { Uwudeck } from './src/core/Uwudeck.js';
import { logger } from './src/utils/logger.js';

const app = new Uwudeck();

app.start();

process.on('SIGINT', async () => {
    await app.stop();
    logger.forceLogSync('INFO', "Script fermé proprement.");
    process.exit(0);
});