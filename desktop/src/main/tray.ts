import { Tray, Menu, app, BrowserWindow, nativeImage, screen, ipcMain } from 'electron';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { isPro, validateLicenseOnline, isValidKeyFormat } from './licenseManager';

// Load the Nextouch logo as tray icon
const getIcon = () => {
    const isDev = !app.isPackaged;
    const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
    const iconPath = isDev
        ? path.join(__dirname, '../../assets', iconName)
        : path.join(process.resourcesPath, 'assets', iconName); // standard electron-builder resource path

    // console.log('Loading tray icon from:', iconPath);
    try {
        const icon = nativeImage.createFromPath(iconPath);
        return icon.resize({ width: 32, height: 32, quality: 'best' });
    } catch (e) {
        console.error('Failed to load tray icon:', e);
        return nativeImage.createEmpty();
    }
};

let tray: Tray | null = null;
let qrWindow: BrowserWindow | null = null;

// Handle license activation from popup (now async with online check)
ipcMain.on('activate-license', async (event, key: string) => {
    if (!isValidKeyFormat(key)) {
        event.reply('license-result', { valid: false, message: 'Invalid key format' });
        return;
    }
    const result = await validateLicenseOnline(key);
    event.reply('license-result', result);
});

ipcMain.on('check-pro', (event) => {
    event.reply('pro-status', isPro());
});

// Handle opening external links
ipcMain.on('open-url', (event, url) => {
    require('electron').shell.openExternal(url);
});

export function createTray(): Tray {
    const icon = getIcon();
    tray = new Tray(icon);
    tray.setToolTip('Nextouch');

    // Right-click shows QR popup (no native menu)
    tray.on('right-click', () => {
        showQRWindow();
    });

    // Left-click also shows QR popup
    tray.on('click', () => {
        showQRWindow();
    });

    return tray;
}

export function showQRWindow() {
    if (qrWindow) {
        qrWindow.show();
        qrWindow.focus();
        return;
    }

    // Get tray bounds to position window near it
    const trayBounds = tray?.getBounds();
    const display = screen.getPrimaryDisplay();
    const windowWidth = 280;
    const windowHeight = 520; // Increased height for extra links

    // Position near tray icon (bottom-right on Windows typically)
    let x = display.workArea.width - windowWidth - 10;
    let y = display.workArea.height - windowHeight - 10;

    if (trayBounds) {
        x = Math.round(trayBounds.x - windowWidth / 2 + trayBounds.width / 2);
        y = Math.round(trayBounds.y - windowHeight);
        // Clamp to screen
        x = Math.max(10, Math.min(x, display.workArea.width - windowWidth - 10));
        y = Math.max(10, y);
    }

    qrWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x,
        y,
        show: true,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        transparent: true,
        icon: getIcon(), // Ensure window has the icon
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // QR popup with license input
    qrWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background: transparent;
                    font-family: 'Segoe UI', system-ui, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: flex-end;
                    height: 100vh;
                }
                .container {
                    background: #000;
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                    border: 1px solid rgba(255,255,255,0.15);
                    box-shadow: 0 4px 24px rgba(0,0,0,0.6);
                    width: 100%;
                }
                .logo { color: white; font-size: 18px; font-weight: bold; letter-spacing: 2px; margin-bottom: 4px; }
                .pro-badge { background: #4CAF50; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
                .subtitle { color: rgba(255,255,255,0.4); font-size: 11px; margin-bottom: 16px; }
                #qr { background: white; padding: 10px; border-radius: 10px; display: block; margin: 0 auto; width: 160px; height: 160px; }
                .hint { color: rgba(255,255,255,0.35); font-size: 10px; margin-top: 12px; }

                .divider { height: 1px; background: rgba(255,255,255,0.1); margin: 12px 0 10px 0; }
                .license-section { margin-bottom: 10px; }
                .license-input { width: 100%; padding: 8px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); color: white; font-size: 12px; text-align: center; margin-bottom: 8px; }
                .license-input::placeholder { color: rgba(255,255,255,0.3); }
                .activate-btn { background: #4CAF50; border: none; color: white; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; width: 100%; }
                .activate-btn:hover { background: #45a049; }
                .link-btn { background: rgba(255,255,255,0.08); border: none; color: white; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; width: 100%; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; }
                .link-btn:hover { background: rgba(255,255,255,0.15); }
                .quit-btn { background: transparent; border: none; color: rgba(255,255,255,0.7); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; width: 100%; }
                .quit-btn:hover { background: rgba(255,255,255,0.1); color: white; }
                .status-msg { font-size: 11px; margin-top: 6px; height: 14px; }
                .success { color: #4CAF50; }
                .error { color: #f44336; }
                .hidden { display: none !important; }
                .buy-link { color: #4CAF50; text-decoration: none; font-size: 12px; display: block; margin-top: 10px; cursor: pointer; }
                .buy-link:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">NEXTOUCH<span id="proBadge" class="pro-badge hidden">PRO</span></div>
                <div class="subtitle">Scan with mobile app</div>
                
                <img id="qr" />
                <div class="hint">Same WiFi or USB tethering required</div>
                
                <div class="divider"></div>
                
                <button class="link-btn" onclick="openUrl('https://nextouch.futumore.pl/#download')">
                    📱 Get Mobile App
                </button>

                <div id="licenseSection" class="license-section">
                    <input type="text" id="licenseKey" class="license-input" placeholder="NXTH-XXXX-XXXX-XXXX" maxlength="19" />
                    <button id="activateBtn" class="activate-btn">Activate Pro</button>
                    <a id="buyLink" class="buy-link" onclick="openUrl('https://nextouch.futumore.pl/#pricing')">Buy Pro License</a>
                    <div id="statusMsg" class="status-msg"></div>
                </div>
                
                <button class="quit-btn" onclick="require('electron').ipcRenderer.send('quit-app')">Quit</button>
            </div>
            <script>
                const { ipcRenderer } = require('electron');
                
                function openUrl(url) {
                    ipcRenderer.send('open-url', url);
                }

                ipcRenderer.on('asynchronous-reply', (event, data) => {
                    document.getElementById('qr').src = data.qrDataUrl;
                });
                ipcRenderer.send('asynchronous-message', 'get-qr');
                
                ipcRenderer.on('pro-status', (event, status) => {
                    const isPro = typeof status === 'object' ? status.isPro : status;
                    const trialExpired = typeof status === 'object' ? status.trialExpired : false;

                    if (isPro) {
                        document.getElementById('proBadge').classList.remove('hidden');
                        document.getElementById('licenseSection').classList.add('hidden');
                    } else if (trialExpired) {
                        const subtitle = document.querySelector('.subtitle');
                        subtitle.innerText = 'TRIAL EXPIRED';
                        subtitle.style.color = '#ff4444';
                        subtitle.style.fontWeight = 'bold';
                        
                        document.getElementById('qr').style.display = 'none';
                        document.querySelector('.hint').innerText = 'Trial ended. Please activate Pro License.';
                        
                        // Make Buy link more prominent
                        const buyLink = document.getElementById('buyLink');
                        buyLink.style.background = '#4CAF50';
                        buyLink.style.color = 'white';
                        buyLink.style.padding = '8px';
                        buyLink.style.borderRadius = '6px';
                        buyLink.style.marginTop = '8px';
                        buyLink.innerText = 'Buy Pro Now';
                    }
                });
                
                ipcRenderer.send('check-pro');
                
                document.getElementById('activateBtn').onclick = () => {
                    const key = document.getElementById('licenseKey').value.trim();
                    if (key) {
                        const btn = document.getElementById('activateBtn');
                        const msg = document.getElementById('statusMsg');
                        btn.disabled = true;
                        btn.textContent = 'Validating...';
                        msg.textContent = '';
                        ipcRenderer.send('activate-license', key);
                    }
                };
                
                ipcRenderer.on('license-result', (event, result) => {
                    const btn = document.getElementById('activateBtn');
                    const msg = document.getElementById('statusMsg');
                    btn.disabled = false;
                    btn.textContent = 'Activate Pro';
                    if (result.valid) {
                        msg.textContent = 'License activated!';
                        msg.className = 'status-msg success';
                        document.getElementById('proBadge').classList.remove('hidden');
                        document.getElementById('licenseSection').classList.add('hidden');
                    } else {
                        msg.textContent = result.message || 'Activation failed';
                        msg.className = 'status-msg error';
                    }
                });
                
                document.getElementById('licenseKey').oninput = (e) => {
                    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    let formatted = '';
                    for (let i = 0; i < val.length && i < 16; i++) {
                        if (i === 4 || i === 8 || i === 12) formatted += '-';
                        formatted += val[i];
                    }
                    e.target.value = formatted;
                };
            </script>
        </body>
        </html>
    `));

    qrWindow.on('blur', () => { if (qrWindow) qrWindow.close(); });
    qrWindow.on('closed', () => { qrWindow = null; });
}
