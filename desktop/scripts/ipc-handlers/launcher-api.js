const { app, ipcMain, dialog, BrowserWindow } = require('electron');

// Replaces the legacy electron.remote API with explicit IPC calls.

ipcMain.on('launcherGetPath', (e, name) => {
    // Electron uses "desktop"; KeeWeb historically asked for "userDesktop"
    if (name === 'userDesktop') {
        name = 'desktop';
    }
    e.returnValue = app.getPath(name);
});

ipcMain.on('launcherGetAppPath', (e) => {
    e.returnValue = app.getAppPath();
});

ipcMain.handle('launcherLoadConfig', (e, name) => app.loadConfig(name));

ipcMain.handle('launcherSaveConfig', (e, name, data) => app.saveConfig(name, data));

ipcMain.handle('launcherShowSaveDialog', (e, options) =>
    dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), options)
);

ipcMain.handle('launcherHttpRequest', (e, config) => {
    return new Promise((resolve) => {
        app.httpRequest(
            {
                ...config,
                error: (error) => resolve({ error })
            },
            () => {},
            (response) => resolve(response)
        );
    });
});

ipcMain.handle('launcherResolveProxy', (e, url) => e.sender.session.resolveProxy(url));

ipcMain.on('launcherMinimizeApp', (e, labels) => app.minimizeApp(labels));

ipcMain.on('launcherHideApp', () => {
    if (process.platform === 'darwin') {
        app.hide();
    } else {
        app.minimizeThenHideIfInTray();
    }
});

ipcMain.on('launcherShowAndFocusMainWindow', () => app.showAndFocusMainWindow());

ipcMain.on('launcherSetGlobalShortcuts', (e, appSettings) => app.setGlobalShortcuts(appSettings));

ipcMain.on('launcherSetHookBeforeQuitEvent', (e, hooked) => app.setHookBeforeQuitEvent(hooked));

ipcMain.on('launcherRestartAndUpdate', (e, updateFilePath) => app.restartAndUpdate(updateFilePath));

ipcMain.on('launcherQuit', () => app.quit());

ipcMain.on('launcherOpenDevTools', (e) => e.sender.openDevTools({ mode: 'bottom' }));

ipcMain.on('launcherSetAboutPanelOptions', (e, options) => app.setAboutPanelOptions(options));

ipcMain.on('launcherIsAppFocused', (e) => {
    e.returnValue = !!BrowserWindow.getFocusedWindow();
});

ipcMain.on('launcherMinimizeWindow', (e) => {
    const window = BrowserWindow.fromWebContents(e.sender);
    if (window) {
        window.minimize();
    }
});

ipcMain.on('launcherMaximizeWindow', (e) => {
    const window = BrowserWindow.fromWebContents(e.sender);
    if (window) {
        window.maximize();
    }
});

ipcMain.on('launcherRestoreWindow', (e) => {
    const window = BrowserWindow.fromWebContents(e.sender);
    if (window) {
        window.restore();
    }
});

ipcMain.on('launcherIsMaximized', (e) => {
    const window = BrowserWindow.fromWebContents(e.sender);
    e.returnValue = !!window && window.isMaximized();
});
