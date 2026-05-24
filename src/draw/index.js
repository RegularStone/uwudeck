import { logger } from '../utils/logger.js';

export async function resetScreenDraw(device) {
    logger.info("🔓 Déblocage de l'écran avec drawCanvas...");
    await device.drawCanvas({
        id: 'center',
        width: 480,
        height: 288, // Ajuste à 270 si tu es sur Loupedeck Live / Live S
        x: 0,
        y: 0
    }, (ctx, width, height) => {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
    });

    await new Promise(resolve => setTimeout(resolve, 200)); // Laisse le temps au hardware de réagir

    // 2. On nettoie chaque touche individuellement (pour écraser les logos)
    logger.info("🧹 Nettoyage des logos verts sur toutes les touches...");
    for (let i = 0; i < 15; i++) { // Met i < 12 si c'est un modèle 12 touches
        await device.drawKey(i, (ctx, width, height) => {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);
        });
    }
    logger.info("✅ Interface prête !");
}