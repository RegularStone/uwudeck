import { Uwudeck } from './src/core/Uwudeck.js';
import { logger } from './src/utils/logger.js';

const app = new Uwudeck();

process.on('SIGINT', async () => {
    await app.stop();
    logger.forceLogSync('INFO', "Script fermé proprement.");
    await new Promise(resolve => setTimeout(resolve, 200));
    process.exit(0);
});

app.start();

