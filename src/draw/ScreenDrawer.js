import { logger } from '../utils/logger.js';

export class ScreenDrawer {
    constructor(device) {
        this.device = device;
    }

    async resetScreen() {
        logger.info("🔓 Déblocage de l'écran avec drawCanvas...");
        await this.device.drawCanvas({
            id: 'center',
            width: 480,
            height: 288, 
            x: 0,
            y: 0
        }, (ctx, width, height) => {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);
        });

        await new Promise(resolve => setTimeout(resolve, 200)); 

        logger.info("🧹 Nettoyage des logos verts sur toutes les touches...");
        for (let i = 0; i < 15; i++) { 
            await this.device.drawKey(i, (ctx, width, height) => {
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, width, height);
            });
        }
        logger.info("✅ Interface prête !");
    }
}