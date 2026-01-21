import { app, BrowserWindow, Menu, Tray, ipcMain } from 'electron';
import * as path from 'path';
import { createTray, showQRWindow } from './tray';
import { startServer } from './server';

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null; // Hidden window if needed, or just tray

app.disableHardwareAcceleration(); // Performance optimization for background apps

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        showQRWindow();
    });

    app.on('ready', () => {
        // Create system tray
        tray = createTray();

        // Start P2P Server
        startServer();

        // Show window on startup
        showQRWindow();

        // IPC handler for quit button in QR popup
        ipcMain.on('quit-app', () => {
            app.quit();
        });

        console.log('Nextouch Desktop Started');
    });
}

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Keep running in background
    }
});

// Hide dock icon on macOS
if (process.platform === 'darwin') {
    app.dock?.hide();
}
