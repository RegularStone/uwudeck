// Worker thread isolé pour node-windows-audio-manager-switcher
// Nécessaire car native-sound-mixer et ce module conflictuent sur COM
const { parentPort, workerData } = require('worker_threads');
const switcher = require('node-windows-audio-manager-switcher');

try {
    let result;
    if (workerData.op === 'list') {
        result = switcher.listDevices();
    } else if (workerData.op === 'set') {
        result = switcher.setDefaultDevice(workerData.deviceId);
    }
    parentPort.postMessage({ ok: true, result });
} catch (e) {
    parentPort.postMessage({ ok: false, error: e.message });
}
