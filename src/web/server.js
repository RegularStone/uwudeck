// src/web/server.js
import express      from 'express';
import { WebSocketServer } from 'ws';
import { createServer }    from 'http';
import { fileURLToPath }   from 'url';
import { dirname, join }   from 'path';
import { createRoutes }    from './api/routes.js';
import { logger }          from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WebServer {
    /**
     * @param {object} uwudeck  - Instance Uwudeck (accès au device + feedbackManager)
     */
    constructor(uwudeck) {
        this.uwudeck = uwudeck;
        this.app     = express();
        this.server  = createServer(this.app);
        this.wss     = new WebSocketServer({ server: this.server });
        this.port    = 3000;
    }

    start() {
        // ---- Middleware -------------------------------------------- //
        this.app.use(express.json());
        this.app.use(express.static(join(__dirname, 'public')));

        // ---- Routes API ------------------------------------------- //
        this.app.use('/api', createRoutes(this.uwudeck, (event) => this.broadcast(event)));

        // ---- WebSocket -------------------------------------------- //
        this.wss.on('connection', (ws) => {
            logger.info('UI web connectée');
            ws.on('close', () => logger.info('UI web déconnectée'));
        });

        // ---- Lancement -------------------------------------------- //
        this.server.listen(this.port, () => {
            logger.success(`Interface web disponible sur http://localhost:${this.port}`);
        });
    }

    /**
     * Diffuse un événement JSON à tous les clients WS connectés.
     * Utilisé pour notifier l'UI d'un changement (binding sauvegardé,
     * page changée, etc.) sans que le front ait à poller.
     */
    broadcast(event) {
        const msg = JSON.stringify(event);
        for (const client of this.wss.clients) {
            if (client.readyState === 1) client.send(msg);
        }
    }

    stop() {
        this.server.close();
    }
}