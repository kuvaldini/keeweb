import { Events } from 'framework/events';
import { StartProfiler } from 'comp/app/start-profiler';
import { RuntimeInfo } from 'const/runtime-info';
import { Locale } from 'util/locale';
import { Logger } from 'util/logger';
import { noop } from 'util/fn';

const logger = new Logger('launcher');

const Launcher = {
    name: 'electron',
    version: window.process.versions.electron,
    autoTypeSupported: true,
    thirdPartyStoragesSupported: true,
    clipboardSupported: true,
    req: window.require,
    platform() {
        return process.platform;
    },
    arch() {
        return process.arch;
    },
    electron() {
        return this.req('electron');
    },
    ipc() {
        return this.electron().ipcRenderer;
    },
    getPath(name) {
        return this.ipc().sendSync('launcherGetPath', name);
    },
    openLink(href) {
        if (/^(http|https|ftp|sftp|mailto):/i.test(href)) {
            this.electron().shell.openExternal(href);
        }
    },
    devTools: true,
    openDevTools() {
        this.ipc().send('launcherOpenDevTools');
    },
    getSaveFileName(defaultPath, callback) {
        if (defaultPath) {
            defaultPath = this.joinPath(this.getPath('desktop'), defaultPath);
        }
        this.ipc()
            .invoke('launcherShowSaveDialog', {
                title: Locale.launcherSave,
                defaultPath,
                filters: [{ name: Locale.launcherFileFilter, extensions: ['kdbx'] }]
            })
            .then((res) => callback(res.filePath));
    },
    getUserDataPath(fileName) {
        if (!this.userDataPath) {
            this.userDataPath = this.getPath('userData');
        }
        return this.joinPath(this.userDataPath, fileName || '');
    },
    getTempPath(fileName) {
        let tempPath = this.joinPath(this.getPath('temp'), 'KeeWeb');
        const fs = this.req('fs');
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath);
        }
        if (fileName) {
            tempPath = this.joinPath(tempPath, fileName);
        }
        return tempPath;
    },
    getDocumentsPath(fileName) {
        return this.joinPath(this.getPath('documents'), fileName || '');
    },
    getAppPath(fileName) {
        const dirname = this.req('path').dirname;
        const appPath = __dirname.endsWith('app.asar')
            ? __dirname
            : this.ipc().sendSync('launcherGetAppPath');
        return this.joinPath(dirname(appPath), fileName || '');
    },
    getWorkDirPath(fileName) {
        return this.joinPath(process.cwd(), fileName || '');
    },
    joinPath(...parts) {
        return this.req('path').join(...parts);
    },
    writeFile(path, data, callback) {
        this.req('fs').writeFile(path, window.Buffer.from(data), callback);
    },
    readFile(path, encoding, callback) {
        this.req('fs').readFile(path, encoding, (err, contents) => {
            const data = typeof contents === 'string' ? contents : new Uint8Array(contents);
            callback(data, err);
        });
    },
    fileExists(path, callback) {
        const fs = this.req('fs');
        fs.access(path, fs.constants.F_OK, (err) => callback(!err));
    },
    fileExistsSync(path) {
        const fs = this.req('fs');
        return !fs.accessSync(path, fs.constants.F_OK);
    },
    deleteFile(path, callback) {
        this.req('fs').unlink(path, callback || noop);
    },
    statFile(path, callback) {
        this.req('fs').stat(path, (err, stats) => callback(stats, err));
    },
    mkdir(dir, callback) {
        const fs = this.req('fs');
        const path = this.req('path');
        const stack = [];

        const collect = function (dir, stack, callback) {
            fs.exists(dir, (exists) => {
                if (exists) {
                    return callback();
                }

                stack.unshift(dir);
                const newDir = path.dirname(dir);
                if (newDir === dir || !newDir || newDir === '.' || newDir === '/') {
                    return callback();
                }

                collect(newDir, stack, callback);
            });
        };

        const create = function (stack, callback) {
            if (!stack.length) {
                return callback();
            }

            fs.mkdir(stack.shift(), (err) => (err ? callback(err) : create(stack, callback)));
        };

        collect(dir, stack, () => create(stack, callback));
    },
    parsePath(fileName) {
        const path = this.req('path');
        return {
            path: fileName,
            dir: path.dirname(fileName),
            file: path.basename(fileName)
        };
    },
    createFsWatcher(path) {
        return this.req('fs').watch(path, { persistent: false });
    },
    loadConfig(name) {
        return this.ipc().invoke('launcherLoadConfig', name);
    },
    saveConfig(name, data) {
        return this.ipc().invoke('launcherSaveConfig', name, data);
    },
    httpRequest(config) {
        return this.ipc().invoke('launcherHttpRequest', config);
    },
    preventExit(e) {
        e.returnValue = false;
        return false;
    },
    exit() {
        this.exitRequested = true;
        this.requestExit();
    },
    requestExit() {
        this.ipc().send('launcherSetHookBeforeQuitEvent', false);
        if (this.pendingUpdateFile) {
            this.ipc().send('launcherRestartAndUpdate', this.pendingUpdateFile);
        } else {
            this.ipc().send('launcherQuit');
        }
    },
    requestRestartAndUpdate(updateFilePath) {
        this.pendingUpdateFile = updateFilePath;
        this.requestExit();
    },
    cancelRestart() {
        this.pendingUpdateFile = undefined;
    },
    setClipboardText(text) {
        return this.electron().clipboard.writeText(text);
    },
    getClipboardText() {
        return this.electron().clipboard.readText();
    },
    clearClipboardText() {
        const { clipboard } = this.electron();
        clipboard.clear();
        if (process.platform === 'linux') {
            clipboard.clear('selection');
        }
    },
    quitOnRealQuitEventIfMinimizeOnQuitIsEnabled() {
        return !!this.pendingUpdateFile;
    },
    minimizeApp() {
        this.ipc().send('launcherMinimizeApp', {
            restore: Locale.menuRestoreApp.replace('{}', 'KeeWeb'),
            quit: Locale.menuQuitApp.replace('{}', 'KeeWeb')
        });
    },
    canDetectOsSleep() {
        return process.platform !== 'linux';
    },
    updaterEnabled() {
        return process.platform !== 'linux';
    },
    resolveProxy(url, callback) {
        this.ipc()
            .invoke('launcherResolveProxy', url)
            .then((proxy) => {
                const match = /^proxy\s+([\w\.]+):(\d+)+\s*/i.exec(proxy);
                proxy = match && match[1] ? { host: match[1], port: +match[2] } : null;
                callback(proxy);
            })
            .catch(() => callback(null));
    },
    hideApp() {
        this.ipc().send('launcherHideApp');
    },
    isAppFocused() {
        return this.ipc().sendSync('launcherIsAppFocused');
    },
    showMainWindow() {
        this.ipc().send('launcherShowAndFocusMainWindow');
    },
    spawn(config) {
        const ts = logger.ts();
        const { ipcRenderer } = this.electron();
        let { complete } = config;
        delete config.complete;
        ipcRenderer
            .invoke('spawnProcess', config)
            .then((res) => {
                if (res.err) {
                    logger.error('spawn error: ' + config.cmd + ', ' + logger.ts(ts), res.err);
                    complete?.(res.err);
                } else {
                    const code = res.code;
                    const stdout = res.stdout || '';
                    const stderr = res.stderr || '';
                    const msg = 'spawn ' + config.cmd + ': ' + code + ', ' + logger.ts(ts);
                    if (code !== 0) {
                        logger.error(msg + '\n' + stdout + '\n' + stderr);
                    } else {
                        logger.info(msg + (stdout && !config.noStdOutLogging ? '\n' + stdout : ''));
                    }
                    complete?.(code !== 0 ? 'Exit code ' + code : null, stdout, code);
                }
                complete = null;
            })
            .catch((err) => {
                complete?.(err);
            });
    },
    checkOpenFiles() {
        this.readyToOpenFiles = true;
        if (this.pendingFileToOpen) {
            this.openFile(this.pendingFileToOpen);
            delete this.pendingFileToOpen;
        }
    },
    openFile(file) {
        if (this.readyToOpenFiles) {
            Events.emit('launcher-open-file', file);
        } else {
            this.pendingFileToOpen = file;
        }
    },
    setGlobalShortcuts(appSettings) {
        this.ipc().send('launcherSetGlobalShortcuts', appSettings);
    },
    minimizeMainWindow() {
        this.ipc().send('launcherMinimizeWindow');
    },
    maximizeMainWindow() {
        this.ipc().send('launcherMaximizeWindow');
    },
    restoreMainWindow() {
        this.ipc().send('launcherRestoreWindow');
    },
    mainWindowMaximized() {
        return this.ipc().sendSync('launcherIsMaximized');
    }
};

Events.on('launcher-exit-request', () => {
    setTimeout(() => Launcher.exit(), 0);
});
Events.on('launcher-minimize', () => setTimeout(() => Events.emit('app-minimized'), 0));
Events.on('launcher-maximize', () => setTimeout(() => Events.emit('app-maximized'), 0));
Events.on('launcher-unmaximize', () => setTimeout(() => Events.emit('app-unmaximized'), 0));
Events.on('launcher-started-minimized', () => setTimeout(() => Launcher.minimizeApp(), 0));
Events.on('start-profile', (data) => StartProfiler.reportAppProfile(data));

window.launcherOpen = (file) => Launcher.openFile(file);
if (window.launcherOpenedFile) {
    logger.info('Open file request', window.launcherOpenedFile);
    Launcher.openFile(window.launcherOpenedFile);
    delete window.launcherOpenedFile;
}
Events.on('app-ready', () =>
    setTimeout(() => {
        Launcher.checkOpenFiles();
        Launcher.ipc().send('launcherSetAboutPanelOptions', {
            applicationVersion: RuntimeInfo.version,
            version: RuntimeInfo.commit
        });
    }, 0)
);

if (process.platform === 'darwin') {
    Launcher.ipc().send('launcherSetHookBeforeQuitEvent', true);
}

Launcher.ipc().on('remote-app-event', (event, e) => {
    if (window.debugRemoteAppEvents) {
        logger.debug('remote-app-event', e.name);
    }
    Events.emit(e.name, e.data);
});

export { Launcher };
