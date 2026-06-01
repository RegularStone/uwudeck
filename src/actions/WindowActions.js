import { execFile } from 'child_process';
import { logger }   from '../utils/logger.js';

const PS_GET_HWND = `
Add-Type -Name WinApi -Namespace U -MemberDefinition '
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
';
[U.WinApi]::GetForegroundWindow().ToInt64()
`;

const PS_SET_HWND = (hwnd) => `
Add-Type -Name WinApi -Namespace U -MemberDefinition '
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
';
$target = [IntPtr]${hwnd};
[U.WinApi]::keybd_event(0x12, 0, 0x0001, [UIntPtr]::Zero) | Out-Null;
[U.WinApi]::keybd_event(0x12, 0, 0x0003, [UIntPtr]::Zero) | Out-Null;
[U.WinApi]::SetForegroundWindow($target) | Out-Null;
`;

function runPs(script) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve, reject) => {
        execFile('powershell.exe',
            ['-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
            (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout.trim());
            }
        );
    });
}

export class WindowActions {
    constructor(stateStore) {
        this.state = stateStore;
    }

    _guardState() {
        if (!this.state) { logger.warn('WindowActions : pas de StateStore disponible'); return false; }
        return true;
    }

    _getMap() {
        const raw = this.state.get('window_bookmarks');
        if (!raw) return {};
        try { return typeof raw === 'object' ? raw : JSON.parse(raw); }
        catch { return {}; }
    }

    _setMap(map) {
        this.state.set('window_bookmarks', map);
    }

    async bookmarkSet(id = 'default') {
        if (!this._guardState()) return;
        try {
            const hwnd = parseInt(await runPs(PS_GET_HWND), 10);
            if (!hwnd) { logger.warn(`BOOKMARK_SET[${id}] : aucune fenêtre active`); return; }

            const map = this._getMap();
            map[id] = hwnd;
            this._setMap(map);
            logger.info(`BOOKMARK_SET[${id}] : hwnd=${hwnd}`);
        } catch (err) {
            logger.warn(`BOOKMARK_SET[${id}] échoué : ${err.message}`);
        }
    }

    async bookmarkFocus(id = 'default') {
        if (!this._guardState()) return;
        const hwnd = this._getMap()[id];
        if (!hwnd) { logger.warn(`BOOKMARK_FOCUS[${id}] : aucun signet enregistré`); return; }

        try {
            await runPs(PS_SET_HWND(hwnd));
            logger.info(`BOOKMARK_FOCUS[${id}] : hwnd=${hwnd}`);
        } catch (err) {
            logger.warn(`BOOKMARK_FOCUS[${id}] échoué : ${err.message}`);
        }
    }

    bookmarkClear(id = 'default') {
        if (!this._guardState()) return;
        const map = this._getMap();
        delete map[id];
        this._setMap(map);
        logger.info(`BOOKMARK_CLEAR[${id}] : signet effacé`);
    }
}
