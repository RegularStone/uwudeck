// src/screensaver/index.js
import { UwuScreen01 }  from './anims/uwu_screen_01.js';
import { MatrixRain }   from './anims/matrix_rain.js';
import { Starfield }    from './anims/starfield.js';
import { Plasma }       from './anims/plasma.js';
// id → classe de l'animation
export const SCREENSAVER_REGISTRY = new Map([
    ['uwu_screen_01', UwuScreen01],
    ['matrix_rain',   MatrixRain],
    ['starfield',     Starfield],
    ['plasma',        Plasma],
]);
