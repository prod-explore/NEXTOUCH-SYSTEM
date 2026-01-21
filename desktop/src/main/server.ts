import { WebSocketServer, WebSocket } from 'ws';
import * as os from 'os';
import * as QRCode from 'qrcode';
import { mouseControl } from './mouseControl';
import { ipcMain } from 'electron';
import { isPro, isTrialExpired } from './licenseManager';

const PORT = 4724;
const TOKEN = Math.random().toString(36).substring(2, 10);
let wss: WebSocketServer | null = null;

// Get ALL local IPv4 addresses for multi-interface support
export function getAllLocalIPs(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]!) {
            // Skip internal and non-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips.length > 0 ? ips : ['127.0.0.1'];
}

// Get fresh connection info (called each time QR is shown)
export function getConnectionInfo() {
    return {
        ips: getAllLocalIPs(),
        port: PORT,
        token: TOKEN,
        name: os.hostname()
    };
}

export function startServer() {
    wss = new WebSocketServer({ port: PORT });

    const ips = getAllLocalIPs();
    console.log(`Server started on port ${PORT} with token ${TOKEN}`);
    console.log(`Available IPs: ${ips.join(', ')}`);

    // Handle QR request from Tray - generate fresh QR each time
    ipcMain.on('asynchronous-message', async (event: any, arg: any) => {
        if (arg === 'get-qr') {
            // Get CURRENT network interfaces (may have changed since startup)
            const connectionInfo = getConnectionInfo();
            const qrData = JSON.stringify(connectionInfo);
            const qrDataUrl = await QRCode.toDataURL(qrData);
            event.reply('asynchronous-reply', { qrDataUrl, ips: connectionInfo.ips });
        }
    });

    wss.on('connection', (ws) => {
        console.log('Client connected');
        let authenticated = false;

        ws.on('message', (message) => {
            try {
                // First message must be auth
                const msg = JSON.parse(message.toString());
                // console.log('Received message:', msg.type, msg);

                if (!authenticated) {
                    if (msg.type === 'auth' && msg.token === TOKEN) {
                        if (isTrialExpired()) {
                            console.log('Client rejected: Trial Expired');
                            ws.send(JSON.stringify({ type: 'auth', status: 'error', message: 'Trial Expired. Please Activate Pro.' }));
                            ws.close();
                            return;
                        }

                        authenticated = true;
                        console.log('Client authenticated successfully');
                        // Include Pro status in auth response
                        ws.send(JSON.stringify({
                            type: 'auth',
                            status: 'ok',
                            pro: isPro()
                        }));
                    } else {
                        console.log('Auth failed - token mismatch');
                        ws.send(JSON.stringify({ type: 'auth', status: 'error' }));
                        ws.close();
                    }
                    return;
                }

                // Handle Input Commands
                // console.log('Processing command:', msg.type);
                switch (msg.type) {
                    case 'move':
                        mouseControl.move(msg.dx, msg.dy);
                        break;
                    case 'click':
                        mouseControl.click(msg.button, msg.double);
                        break;
                    case 'scroll':
                        mouseControl.scroll(msg.dx, msg.dy);
                        break;
                    case 'mousedown':
                        mouseControl.mouseDown(msg.button || 'left');
                        break;
                    case 'mouseup':
                        mouseControl.mouseUp(msg.button || 'left');
                        break;
                    case 'keypress':
                        mouseControl.type(msg.key);
                        break;
                }
            } catch (e) {
                console.error('Error processing message:', e);
            }
        });
    });
}
