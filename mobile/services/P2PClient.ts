type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ConnectionCallback = (status: ConnectionStatus) => void;

class P2PClient {
    private ws: WebSocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private listeners: ((status: ConnectionStatus, message?: string) => void)[] = [];
    private reconnectInterval: ReturnType<typeof setInterval> | null = null;
    private currentConfig: { ips: string[]; port: number; token: string } | null = null;
    private currentIpIndex: number = 0;
    private connectedIp: string | null = null; // Remember which IP worked
    private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

    // Connect with multiple IPs (tries each one until success)
    connect(ipOrIps: string | string[], port: number, token: string) {
        const ips = Array.isArray(ipOrIps) ? ipOrIps : [ipOrIps];
        this.currentConfig = { ips, port, token };
        this.currentIpIndex = 0;
        this.connectedIp = null;
        this.tryNextIp();
    }

    private tryNextIp() {
        if (!this.currentConfig) return;

        // Clear any existing timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        const { ips, port, token } = this.currentConfig;
        if (this.currentIpIndex >= ips.length) {
            // All IPs exhausted
            this.setStatus('error', 'Could not connect to any IP address');
            return;
        }

        const ip = ips[this.currentIpIndex];
        this.setStatus('connecting');
        console.log(`Trying IP ${this.currentIpIndex + 1}/${ips.length}: ${ip}`);

        try {
            // Close any existing connection
            if (this.ws) {
                this.ws.onclose = null; // Prevent triggering reconnect
                this.ws.close();
            }

            this.ws = new WebSocket(`ws://${ip}:${port}`);

            // Timeout for this connection attempt
            this.connectionTimeout = setTimeout(() => {
                if (this.status === 'connecting') {
                    console.log(`Timeout on ${ip}, trying next...`);
                    if (this.ws) {
                        this.ws.onclose = null; // Prevent double retry
                        this.ws.close();
                    }
                    this.currentIpIndex++;
                    this.tryNextIp();
                }
            }, 3000); // 3 second timeout per IP

            this.ws.onopen = () => {
                // Send auth (don't clear timeout yet - wait for auth response)
                this.ws?.send(JSON.stringify({ type: 'auth', token }));
            };

            this.ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data as string);
                    if (msg.type === 'auth' && msg.status === 'ok') {
                        // SUCCESS - clear timeout and remember this IP
                        if (this.connectionTimeout) {
                            clearTimeout(this.connectionTimeout);
                            this.connectionTimeout = null;
                        }
                        this.connectedIp = ip;
                        this.setStatus('connected');
                        if (this.reconnectInterval) {
                            clearInterval(this.reconnectInterval);
                            this.reconnectInterval = null;
                        }
                    } else if (msg.type === 'auth' && msg.status === 'error') {
                        if (this.connectionTimeout) {
                            clearTimeout(this.connectionTimeout);
                            this.connectionTimeout = null;
                        }
                        this.setStatus('error', msg.message);
                    }
                } catch (err) { }
            };

            this.ws.onclose = () => {
                // Only handle if we were connected (not during initial connection attempts)
                if (this.status === 'connected' && this.connectedIp) {
                    this.setStatus('disconnected');
                    // Reconnect to the SAME IP that was working
                    if (this.currentConfig && !this.reconnectInterval) {
                        this.reconnectInterval = setInterval(() => {
                            if (this.currentConfig && this.connectedIp) {
                                // Try only the IP that was working
                                this.currentConfig.ips = [this.connectedIp];
                                this.currentIpIndex = 0;
                                this.tryNextIp();
                            }
                        }, 3000);
                    }
                }
                // Note: during initial connection attempts, timeout handles the retry
            };

            this.ws.onerror = (e) => {
                console.log('WS Error', e);
                // Let timeout or onclose handle retry
            };

        } catch (e) {
            this.currentIpIndex++;
            this.tryNextIp();
        }
    }

    disconnect() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        this.currentConfig = null;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.setStatus('disconnected');
    }

    send(type: string, data: object = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, ...data }));
        }
    }

    move(dx: number, dy: number) {
        this.send('move', { dx, dy });
    }

    click(button: 'left' | 'right' | 'middle', double: boolean = false) {
        this.send('click', { button, double });
    }

    scroll(dx: number, dy: number) {
        this.send('scroll', { dx, dy });
    }

    typeText(text: string) {
        this.send('keypress', { key: text });
    }

    onStatusChange(callback: (status: ConnectionStatus, message?: string) => void) {
        this.listeners.push(callback);
        // Call immediately with current status
        callback(this.status);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private setStatus(status: ConnectionStatus, message?: string) {
        this.status = status;
        this.listeners.forEach(l => l(status, message));
    }
}

export const client = new P2PClient();
