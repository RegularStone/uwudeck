import pkg from 'native-sound-mixer';
const SoundMixer = pkg.default || pkg;
const { DeviceType } = pkg;
import path from 'path';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {logger} from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function runSwitcherWorker(workerData) {
    return new Promise((resolve, reject) => {
        const w = new Worker(join(__dirname, 'audioSwitcherWorker.cjs'), { workerData });
        w.once('message', msg => msg.ok ? resolve(msg.result) : reject(new Error(msg.error)));
        w.once('error', reject);
    });
}

export class AudioActions {
    constructor() {
        logger.info("Module AudioActions initialisé");
    }

    changeSystemVolume(delta) {
        try {
            const defaultDevice = SoundMixer.getDefaultDevice(DeviceType.RENDER);
            if (!defaultDevice) return false;

            const step = 0.05; 
            let newVolume = defaultDevice.volume + (delta > 0 ? step : -step);
            newVolume = Math.max(0, Math.min(1, newVolume));
            
            defaultDevice.volume = newVolume;
            logger.info(`Volume système : ${Math.round(newVolume * 100)}%`);
            
            return false; // On retourne false pour éviter un feedback haptique sur les changements de volume système
        } catch (e) {
            logger.error("Erreur volume système", e);
            return false;
        }
    }

    changeAppVolume(delta, targetApp) {
        try {
            const defaultDevice = SoundMixer.getDefaultDevice(DeviceType.RENDER);
            if (!defaultDevice) return false;

            const targetSession = defaultDevice.sessions.find(session => {
                if (!session.appName) return false;
                return path.basename(session.appName).toLowerCase() === targetApp.toLowerCase();
            });

            if (targetSession) {
                const step = 0.05;
                let newVolume = targetSession.volume + (delta > 0 ? step : -step);
                newVolume = Math.max(0, Math.min(1, newVolume));
                
                targetSession.volume = newVolume;
                logger.info(`Volume ${targetApp} : ${Math.round(newVolume * 100)}%`);
                
                return false; // On retourne false pour éviter un feedback haptique sur les changements de volume d'application
            } else {
                return false; 
            }
        } catch (e) {
            logger.error(`Erreur critique dans changeAppVolume pour ${targetApp} :`, e.message || e);
            return false;
        }
    }

    toggleSystemMute() {
        try {
            const defaultDevice = SoundMixer.getDefaultDevice(DeviceType.RENDER);
            if (!defaultDevice) return false;

            // On inverse l'état actuel
            defaultDevice.mute = !defaultDevice.mute;
            logger.info(`Mute système : ${defaultDevice.mute ? "ON" : "OFF"}`);
            
            return false; // On retourne false pour éviter un feedback haptique sur les changements de mute système
        } catch (e) {
            logger.error("Erreur mute système", e);
            return false;
        }
    }

    getSystemVolume() {
        try {
            const defaultDevice = SoundMixer.getDefaultDevice(DeviceType.RENDER);
            return defaultDevice ? Math.max(0, Math.min(1, defaultDevice.volume)) : 0;
        } catch (e) {
            logger.error('Erreur lecture volume système', e);
            return 0;
        }
    }

    getAppVolume(targetApp) {
        try {
            const defaultDevice = SoundMixer.getDefaultDevice(DeviceType.RENDER);
            if (!defaultDevice) return 0;
            const session = defaultDevice.sessions.find(s =>
                s.appName && path.basename(s.appName).toLowerCase() === targetApp.toLowerCase()
            );
            return session ? Math.max(0, Math.min(1, session.volume)) : 0;
        } catch (e) {
            logger.error(`Erreur lecture volume app ${targetApp}`, e);
            return 0;
        }
    }

    async getAudioDevices() {
        try {
            const outputs = await runSwitcherWorker({ op: 'list' });
            const inputs = SoundMixer.devices
                .filter(d => d.type === DeviceType.CAPTURE)
                .map(d => ({ id: d.name, name: d.name, isDefault: false }));
            return { outputs, inputs };
        } catch (e) {
            logger.error('Erreur lecture périphériques audio', e);
            return { outputs: [], inputs: [] };
        }
    }

    async switchAudioOutput(deviceId) {
        try {
            const ok = await runSwitcherWorker({ op: 'set', deviceId });
            if (ok) logger.info(`Sortie audio changée : ${deviceId}`);
            else logger.warn(`Switch sortie audio échoué pour : ${deviceId}`);
            return ok;
        } catch (e) {
            logger.error('Erreur switch sortie audio', e);
            return false;
        }
    }

    switchAudioInput() {
        logger.warn('Switch entrée audio : non supporté (API Windows limitée)');
        return false;
    }

    toggleAppMute(targetApp) {
        // Sécurité si la target est absente du JSON
        if (!targetApp) {
            logger.warn("MUTE_APP_TOGGLE appelé sans target. Repli sur le mute système.");
            return this.toggleSystemMute();
        }

        try {
            const defaultDevice = SoundMixer.getDefaultDevice(DeviceType.RENDER);
            if (!defaultDevice) return false;

            const targetSession = defaultDevice.sessions.find(session => {
                if (!session.appName) return false;
                return path.basename(session.appName).toLowerCase() === targetApp.toLowerCase();
            });

            if (targetSession) {
                targetSession.mute = !targetSession.mute;
                logger.info(`Mute ${targetApp} : ${targetSession.mute ? "ON" : "OFF"}`);
                return false; // On retourne false pour éviter un feedback haptique sur les changements de mute d'application
            }
            return false;
        } catch (e) {
            logger.error(`Erreur mute ${targetApp}`, e);
            return false;
        }
    }
}