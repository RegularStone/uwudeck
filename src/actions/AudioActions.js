import pkg from 'native-sound-mixer';
const SoundMixer = pkg.default || pkg;
const { DeviceType } = pkg;
import path from 'path';
import {logger} from '../utils/logger.js';

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
                return true; 
            }
            return false;
        } catch (e) {
            logger.error(`Erreur mute ${targetApp}`, e);
            return false;
        }
    }
}