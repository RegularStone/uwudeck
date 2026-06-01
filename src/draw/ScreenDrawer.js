import { logger } from '../utils/logger.js';

export class ScreenDrawer {
    constructor(device) {
        this.device = device;
    }

    async resetScreen() {
        logger.info("🔓 Déblocage de l'écran avec drawScreen...");
        await this.device.drawScreen('center', (ctx, width, height) => {
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

        await this.device.setButtonColor({ id: 0, color: "#7A003C" }); // Rose framboise assombri
        await this.device.setButtonColor({ id: 1, color: "#8C4300" }); // Pêche sombre / Cuivre
        await this.device.setButtonColor({ id: 2, color: "#2E6B00" }); // Vert pomme assombri
        await this.device.setButtonColor({ id: 3, color: "#005959" }); // Cyan assombri

        logger.info("✅ Interface prête !");
    }
}