require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// License storage
const LICENSES_FILE = path.join(__dirname, 'licenses.json');

function loadLicenses() {
    try {
        if (fs.existsSync(LICENSES_FILE)) {
            return JSON.parse(fs.readFileSync(LICENSES_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error loading licenses:', e);
    }
    return {};
}

function saveLicenses(licenses) {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(licenses, null, 2));
}

let licenses = loadLicenses();

// Generate license key: NXTH-XXXX-XXXX-XXXX
function generateLicenseKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = 'NXTH';
    for (let i = 0; i < 3; i++) {
        key += '-';
        for (let j = 0; j < 4; j++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    return key;
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: process.env.DOMAIN || '*',
    methods: ['GET', 'POST']
}));

// Stripe webhook needs raw body
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));

// Rate limiting helper (simple in-memory)
const requestCounts = new Map();
function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 30;

    const requests = requestCounts.get(ip) || [];
    const recentRequests = requests.filter(t => now - t < windowMs);
    
    if (recentRequests.length >= maxRequests) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    
    recentRequests.push(now);
    requestCounts.set(ip, recentRequests);
    next();
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create Stripe checkout session
app.post('/api/create-checkout', rateLimit, async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: process.env.STRIPE_PRICE_ID,
                quantity: 1
            }],
            mode: 'payment',
            success_url: `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.DOMAIN}/#pricing`
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error.message);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Stripe webhook
app.post('/api/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const licenseKey = generateLicenseKey();
        
        licenses[licenseKey] = {
            createdAt: new Date().toISOString(),
            email: session.customer_details?.email || 'unknown',
            sessionId: session.id,
            used: false,
            machineId: null
        };
        saveLicenses(licenses);
        console.log(`License created: ${licenseKey}`);
    }

    res.json({ received: true });
});

// Get license after payment
app.get('/api/get-license/:sessionId', rateLimit, async (req, res) => {
    const { sessionId } = req.params;

    for (const [key, data] of Object.entries(licenses)) {
        if (data.sessionId === sessionId) {
            return res.json({
                success: true,
                licenseKey: key,
                email: data.email
            });
        }
    }

    res.status(404).json({ success: false, message: 'License not found' });
});

// Validate license (desktop app)
app.post('/api/validate-license', rateLimit, (req, res) => {
    const { key, machineId } = req.body;

    if (!key || !machineId) {
        return res.json({ valid: false, message: 'Missing key or machineId' });
    }

    const normalizedKey = key.toUpperCase().trim();
    const license = licenses[normalizedKey];

    if (!license) {
        return res.json({ valid: false, message: 'Invalid license key' });
    }

    if (license.used && license.machineId !== machineId) {
        return res.json({ valid: false, message: 'License already activated on another device' });
    }

    license.used = true;
    license.machineId = machineId;
    license.activatedAt = new Date().toISOString();
    saveLicenses(licenses);

    console.log(`License activated: ${normalizedKey}`);
    res.json({ valid: true, message: 'License activated successfully' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Nextouch API running on port ${PORT}`);
});
