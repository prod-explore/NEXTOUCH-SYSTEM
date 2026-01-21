import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';

let proc: ChildProcess | null = null;
const isWindows = os.platform() === 'win32';

// Path to compiled native input controller
// In development: src/native/InputController.exe
// In production: resources/assets/InputController.exe (via extraResources)
const EXE_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'InputController.exe')
    : path.join(__dirname, '../../src/native/InputController.exe');

function ensureProc() {
    if (!isWindows) {
        console.warn('Native input only supported on Windows for MVP');
        return false;
    }

    if (!proc || proc.killed) {
        try {
            // console.log('Spawning Input Controller:', EXE_PATH);
            proc = spawn(EXE_PATH);

            // proc.stdout?.on('data', (data) => console.log('InputCtrl:', data.toString()));
            proc.stderr?.on('data', (data) => console.error('InputCtrl Err:', data.toString()));
            // proc.on('close', (code) => console.log('InputCtrl exited:', code));
        } catch (e) {
            console.error('Failed to spawn input controller', e);
            return false;
        }
    }
    return true;
}

function send(cmd: string) {
    if (ensureProc() && proc?.stdin) {
        proc.stdin.write(cmd + '\n');
    }
}

const SUBDIVISION_RATE = 8; // 8ms = 120Hz
let targetBufferX = 0;
let targetBufferY = 0;
let remainderX = 0;
let remainderY = 0;
let animationLoop: NodeJS.Timeout | null = null;

function ensureLoop() {
    if (animationLoop) return;

    animationLoop = setInterval(() => {
        // If buffer is empty, stop loop
        if (Math.abs(targetBufferX) < 0.1 && Math.abs(targetBufferY) < 0.1) {
            if (animationLoop) {
                clearInterval(animationLoop);
                animationLoop = null;
            }
            targetBufferX = 0;
            targetBufferY = 0;
            return;
        }

        // Calculate step: Move a constant chunk or the remaining buffer if small
        // This ensures linear movement not ease-out
        // We want to clear the buffer in roughly ~3 frames (24ms) to keep latency low
        // but high refresh rate
        const chunks = 3;
        let stepX = targetBufferX / chunks;
        let stepY = targetBufferY / chunks;

        // If step is very small, just finish it to avoid infinite tail
        if (Math.abs(targetBufferX) < 1) stepX = targetBufferX;
        if (Math.abs(targetBufferY) < 1) stepY = targetBufferY;

        targetBufferX -= stepX;
        targetBufferY -= stepY;

        // Accumulate fractional pixels
        const rawMoveX = stepX + remainderX;
        const rawMoveY = stepY + remainderY;

        const moveX = Math.round(rawMoveX);
        const moveY = Math.round(rawMoveY);

        remainderX = rawMoveX - moveX;
        remainderY = rawMoveY - moveY;

        if (moveX !== 0 || moveY !== 0) {
            send(`M ${moveX} ${moveY}`);
        }
    }, SUBDIVISION_RATE);
}

export const mouseControl = {
    move: (dx: number, dy: number) => {
        // Add to buffer queue with 2.5x sensitivity
        targetBufferX += dx * 2.5;
        targetBufferY += dy * 2.5;
        ensureLoop();
    },

    moveTo: (x: number, y: number, screenWidth: number = 0, screenHeight: number = 0) => {
        send(`MA ${x} ${y}`);
    },

    click: (button: 'left' | 'right' | 'middle' = 'left', double: boolean = false) => {
        const btn = button === 'left' ? 'L' : (button === 'right' ? 'R' : 'M');
        send(`C ${btn}`);
        if (double) setTimeout(() => send(`C ${btn}`), 100);
    },

    mouseDown: (button: 'left' | 'right' | 'middle' = 'left') => {
        const btn = button === 'left' ? 'L' : (button === 'right' ? 'R' : 'M');
        send(`D ${btn}`);
    },

    mouseUp: (button: 'left' | 'right' | 'middle' = 'left') => {
        const btn = button === 'left' ? 'L' : (button === 'right' ? 'R' : 'M');
        send(`U ${btn}`);
    },

    scroll: (dx: number, dy: number) => {
        // High precision scroll - 7.5x sensitivity
        send(`S ${Math.round(dy * 7.5)} ${Math.round(dx * 7.5)}`);
    },

    type: (text: string) => {
        send(`K ${text}`);
    }
};
