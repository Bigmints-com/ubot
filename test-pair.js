// Pairing code test — bypasses QR entirely
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { rm } = require('fs/promises');

const SESSION_DIR = './sessions/ubot-session';
const PHONE_NUMBER = '971522891137';

async function main() {
    await rm(SESSION_DIR, { recursive: true, force: true }).catch(() => { });

    const { version } = await fetchLatestBaileysVersion();
    console.log('WA version:', version);

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'info' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // As soon as we get the first QR event, request pairing code instead
        if (qr) {
            console.log('\nQR received — requesting pairing code instead...');
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log('\n========================================');
                console.log('  PAIRING CODE:', code);
                console.log('========================================');
                console.log('\nGo to WhatsApp > Linked Devices > Link a Device');
                console.log('Tap "Link with phone number instead"');
                console.log('Enter the code above\n');
            } catch (err) {
                console.error('Failed to get pairing code:', err.message);
            }
        }

        if (connection === 'open') {
            console.log('\n✅ CONNECTED SUCCESSFULLY!');
            console.log('User:', sock.user);
            // Keep running
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log('\n❌ CONNECTION CLOSED, code:', code);
            console.log('Error:', lastDisconnect?.error?.message);
            process.exit(1);
        }
    });

    console.log('Connecting and requesting pairing code for', PHONE_NUMBER, '...');
}

main().catch(console.error);
