// test-draw.js
// Lance avec : node test-draw.js
// Dessine un exemple de chaque renderer sur les touches tactiles puis quitte.

import { discover } from 'loupedeck';
import { FillRenderer }     from './src/feedback/renderers/FillRenderer.js';
import { TextRenderer }     from './src/feedback/renderers/TextRenderer.js';
import { IconRenderer }     from './src/feedback/renderers/IconRenderer.js';
import { StateBarRenderer } from './src/feedback/renderers/StateBarRenderer.js';

console.log('🔌 Connexion au Loupedeck...');
const device = await discover();
console.log('✅ Connecté !');

// Petite pause pour laisser le firmware se stabiliser
await new Promise(r => setTimeout(r, 500));

const fill     = new FillRenderer(device);
const text     = new TextRenderer(device);
const icon     = new IconRenderer(device);
const statebar = new StateBarRenderer(device);

// ------------------------------------------------------------------ //
//  Touch 0 — FillRenderer : couleur unie rouge
// ------------------------------------------------------------------ //
console.log('🎨 Touch 0 → Fill rouge');
await fill.draw(0, { color: '#C0392B' });

// ------------------------------------------------------------------ //
//  Touch 1 — FillRenderer : couleur unie bleue
// ------------------------------------------------------------------ //
console.log('🎨 Touch 1 → Fill bleu');
await fill.draw(1, { color: '#2980B9' });

// ------------------------------------------------------------------ //
//  Touch 2 — TextRenderer : label simple
// ------------------------------------------------------------------ //
console.log('📝 Touch 2 → Text "MUTE"');
await text.draw(2, {
    label:    'MUTE',
    color:    '#FFFFFF',
    bg:       '#C0392B',
    fontSize: 14,
});

// ------------------------------------------------------------------ //
//  Touch 3 — TextRenderer : label avec fond sombre
// ------------------------------------------------------------------ //
console.log('📝 Touch 3 → Text "VOL"');
await text.draw(3, {
    label:    'VOL',
    color:    '#00C8FF',
    bg:       '#111111',
    fontSize: 13,
});

// ------------------------------------------------------------------ //
//  Touch 4 — IconRenderer : tente de charger un PNG
//  Si src/assets/icons/ est vide, affiche un avertissement et passe
// ------------------------------------------------------------------ //
console.log('🖼  Touch 4 → Icon (si src/assets/icons/test.png existe)');
await icon.draw(4, {
    src: 'test.png',
    bg:  '#000000',
    fit: 'contain',
});

// ------------------------------------------------------------------ //
//  Touch 5 — StateBarRenderer : barre à 75%, sans resolver
// ------------------------------------------------------------------ //
console.log('📊 Touch 5 → StateBar 75%');
// On enregistre un resolver factice qui retourne 0.75
statebar.registerResolver('FAKE_VALUE', () => 0.75);
await statebar.draw(5, {
    value_action: 'FAKE_VALUE',
    label:        'SYS',
    color:        '#2ECC71',
    color_low:    '#E74C3C',
    bg:           '#1A1A1A',
    bg_key:       '#000000',
});

// ------------------------------------------------------------------ //
//  Touch 6 — StateBarRenderer : barre à 15% (zone color_low)
// ------------------------------------------------------------------ //
console.log('📊 Touch 6 → StateBar 15% (zone rouge)');
statebar.registerResolver('LOW_VALUE', () => 0.15);
await statebar.draw(6, {
    value_action: 'LOW_VALUE',
    label:        'APP',
    color:        '#2ECC71',
    color_low:    '#E74C3C',
    bg:           '#1A1A1A',
    bg_key:       '#000000',
});

// ------------------------------------------------------------------ //
//  Touch 7 — TextRenderer : style "page indicator"
// ------------------------------------------------------------------ //
console.log('📝 Touch 7 → Text "▶ WEB"');
await text.draw(7, {
    label:    '▶ WEB',
    color:    '#F39C12',
    bg:       '#1A1A1A',
    fontSize: 11,
});

console.log('\n✅ Tous les renderers testés. Vérifie ton Loupedeck !');
console.log('   Appuie sur Ctrl+C pour quitter.\n');

// On reste connecté pour que tu puisses voir le résultat
// Ctrl+C pour quitter proprement
process.on('SIGINT', async () => {
    await device.close();
    process.exit(0);
});