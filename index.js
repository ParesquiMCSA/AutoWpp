const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');

function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const contents = fs.readFileSync(envPath, 'utf8');
    contents.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) return;
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
}

function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

loadEnv();

// Get account info from command line arguments
const accountId = process.argv[2] || 'default';
const contactsFile = process.argv[3] || 'contacts.json';

console.log(`╔════════════════════════════════════════════╗`);
console.log(`║  Account ID: ${accountId.padEnd(29)} ║`);
console.log(`║  Contacts:   ${contactsFile.padEnd(29)} ║`);
console.log(`╚════════════════════════════════════════════╝\n`);

// Load contacts from JSON file
const contactsPath = path.join(__dirname, contactsFile);
let contacts = [];

const SHEET_ID = requireEnv('GOOGLE_SHEET_ID');
const SHEET_RANGE = requireEnv('GOOGLE_SHEET_RANGE');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'Tetrakey.json');

// Error reporting configuration
const ERROR_REPORT_URL = requireEnv('ERROR_REPORT_URL');
const ERROR_REPORT_AUTH_TOKEN = requireEnv('ERROR_REPORT_AUTH_TOKEN');
const ERROR_REPORT_HEADER_KEY = requireEnv('ERROR_REPORT_HEADER_KEY');
const ERROR_REPORT_HEADER_VALUE = requireEnv('ERROR_REPORT_HEADER_VALUE');

// Function to report error to endpoint
async function reportError(phone) {
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    try {
        await axios.post(ERROR_REPORT_URL, {
            data: phone,
            exdata: today
        }, {
            headers: {
                [ERROR_REPORT_HEADER_KEY]: ERROR_REPORT_HEADER_VALUE,
                'Authorization': `Bearer ${ERROR_REPORT_AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`[${accountId}] 📡 Error reported to endpoint for ${phone}`);
    } catch (reportError) {
        console.error(`[${accountId}] ⚠️  Failed to report error to endpoint:`, reportError.message);
    }
}

// Function to update contact's 'sent' status in the JSON file
function markContactAsSent(phoneNumber) {
    try {
        // Find the contact and update sent status
        const contactIndex = contacts.findIndex(c => c.phone === phoneNumber);
        if (contactIndex !== -1) {
            contacts[contactIndex].sent = true;
            contacts[contactIndex].sentBy = accountId;
            contacts[contactIndex].sentAt = new Date().toISOString();
            
            // Write updated contacts back to file
            fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2), 'utf8');
            console.log(`[${accountId}] 💾 Marked ${phoneNumber} as sent in ${contactsFile}`);
        }
    } catch (error) {
        console.error(`[${accountId}] ⚠️  Failed to update ${contactsFile}:`, error.message);
    }
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

let sheetsClientPromise;

async function getSheetsClient() {
    if (!sheetsClientPromise) {
        sheetsClientPromise = (async () => {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
            const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            auth.setCredentials(token);
            return google.sheets({ version: 'v4', auth });
        })();
    }
    return sheetsClientPromise;
}

async function appendLeadToSheet(phoneNumber, cpf, email) {
    try {
        const sheets = await getSheetsClient();
        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        const timestamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)} - ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: SHEET_RANGE,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[phoneNumber, cpf, email, timestamp]]
            }
        });
        console.log(`[${accountId}] ✅ Lead appended to Google Sheets for ${phoneNumber}`);
        await reportSuccess(phoneNumber, cpf, timestamp);
    } catch (error) {
        console.error(`[${accountId}] ❌ Failed to append lead to Google Sheets:`, error.message);
    }
}

const SUCCESS_REPORT_URL = requireEnv('SUCCESS_REPORT_URL');
const SUCCESS_REPORT_HEADER_KEY = requireEnv('SUCCESS_REPORT_HEADER_KEY');
const SUCCESS_REPORT_HEADER_VALUE = requireEnv('SUCCESS_REPORT_HEADER_VALUE');

async function reportSuccess(phoneNumber, cpf, timestamp) {
    try {
        await axios.post(SUCCESS_REPORT_URL, {
            telefone: phoneNumber,
            cpf_cnpj: cpf,
            time: timestamp
        }, {
            headers: {
                [SUCCESS_REPORT_HEADER_KEY]: SUCCESS_REPORT_HEADER_VALUE,
                'Content-Type': 'application/json'
            }
        });
        console.log(`[${accountId}] 📡 Success reported to endpoint for ${phoneNumber}`);
    } catch (error) {
        console.error(`[${accountId}] ⚠️  Failed to report success to endpoint:`, error.message);
    }
}

async function resolvePhoneNumber(client, from) {
    if (!from) return null;
    if (from.endsWith('@c.us')) {
        return from.replace('@c.us', '');
    }
    if (from.endsWith('@lid')) {
        const results = await client.getContactLidAndPhone([from]);
        const phone = results?.[0]?.pn ?? null;
        return phone ? phone.replace('@c.us', '') : null;
    }
    return null;
}

try {
    const contactsData = fs.readFileSync(contactsPath, 'utf8');
    contacts = JSON.parse(contactsData);
    console.log(`[${accountId}] 📋 Loaded ${contacts.length} contacts from ${contactsFile}`);
} catch (error) {
    console.error(`[${accountId}] ❌ Error loading ${contactsFile}:`, error.message);
    process.exit(1);
}

// Initialize the client with unique clientId for separate authentication
const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: accountId  // This creates .ww-session-{accountId}/
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Event: Generate QR code
client.on('qr', (qr) => {
    console.log(`\n[${accountId}] 📱 Scan this QR code with WhatsApp:`);
    console.log(`[${accountId}] Open WhatsApp > Settings > Linked Devices > Link a Device\n`);
    qrcode.generate(qr, { small: true });
});

// Function to send messages to all contacts
async function sendMessagesToContacts() {
    console.log(`\n[${accountId}] 🚀 Starting to send messages...\n`);
    
    // Filter only unsent contacts
    const unsentContacts = contacts.filter(c => c.sent === false);
    
    if (unsentContacts.length === 0) {
        console.log(`[${accountId}] ℹ️  No unsent messages. All contacts have already been messaged.`);
        console.log(`[${accountId}] ℹ️  To reset, set "sent": false in ${contactsFile}\n`);
        return;
    }
    
    console.log(`[${accountId}] 📊 Found ${unsentContacts.length} unsent contact(s) out of ${contacts.length} total\n`);
    
    for (let i = 0; i < unsentContacts.length; i++) {
        const contact = unsentContacts[i];
        const { phone, message, delay } = contact;
        
        try {
            // Format phone number for WhatsApp (remove + and add @c.us)
            const chatId = phone.replace('+', '') + '@c.us';
            
            console.log(`[${accountId}] 📤 Sending to ${phone}...`);
            await client.sendMessage(chatId, message);
            console.log(`[${accountId}] ✅ Message sent to ${phone}`);
            
            // Mark as sent in the JSON file
            markContactAsSent(phone);
            
            // Wait for the contact's specified delay before sending next message
            if (i < unsentContacts.length - 1 && delay) {
                const jitter = Math.floor(randomBetween(1000, 5000));
                const totalDelay = delay + jitter;
                console.log(`[${accountId}] ⏳ Waiting ${totalDelay}ms before next message...\n`);
                await new Promise(resolve => setTimeout(resolve, totalDelay));
            } else if (i < unsentContacts.length - 1) {
                // Default delay if not specified
                const baseDelay = 2000;
                const jitter = Math.floor(randomBetween(1000, 5000));
                const totalDelay = baseDelay + jitter;
                console.log(`[${accountId}] ⏳ Waiting ${totalDelay}ms (default + random) before next message...\n`);
                await new Promise(resolve => setTimeout(resolve, totalDelay));
            }
            
        } catch (error) {
            console.error(`[${accountId}] ❌ Error sending to ${phone}:`, error.message);
            // Report error to endpoint
            await reportError(phone);
            // Note: We don't mark as sent if there was an error
        }
    }
    
    console.log(`\n[${accountId}] ✅ All unsent messages sent!`);
    console.log(`[${accountId}] Bot is running and will auto-reply to incoming messages`);
    console.log(`[${accountId}] Press Ctrl+C to exit\n`);
}

// Event: Client is ready
client.on('ready', async () => {
    console.log(`\n[${accountId}] ✅ Client is ready!\n`);
    
    try {
        // Send messages to all contacts
        await sendMessagesToContacts();
        
    } catch (error) {
        console.error(`[${accountId}] ❌ Error:`, error);
    }
});

// Event: Authentication successful
client.on('authenticated', () => {
    console.log(`[${accountId}] ✅ Authenticated successfully!`);
});

// Event: Authentication failure
client.on('auth_failure', (msg) => {
    console.error(`[${accountId}] ❌ Authentication failed:`, msg);
});

// Event: Client disconnected
client.on('disconnected', (reason) => {
    console.log(`[${accountId}] Disconnected:`, reason);
});

// Auto-reply to any incoming message
const leadCapture = new Map();
const MAX_WRONG_ANSWERS = 5;

function getLeadState(chatId) {
    if (!leadCapture.has(chatId)) {
        leadCapture.set(chatId, {
            step: 'cpf',
            cpf: null,
            email: null,
            invalidCpfAttempts: 0,
            postCompletionReplies: 0,
            blocked: false
        });
    }
    return leadCapture.get(chatId);
}

function extractDocumentNumber(value) {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11 || digits.length === 14) {
        return digits;
    }
    return null;
}

function isValidEmailFormat(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

client.on('message_create', async (message) => {
    // Only reply to messages we receive (not messages we send)
    if (!message.fromMe && message.body) {
        try {
            console.log(`[${accountId}] 📨 Received message from ${message.from}: "${message.body}"`);
            const replyDelayMs = randomBetween(1000, 3000);
            await new Promise(resolve => setTimeout(resolve, replyDelayMs));
            const state = getLeadState(message.from);
            const text = message.body.trim();

            if (state.blocked) {
                console.log(`[${accountId}] 🛑 Ignoring ${message.from} due to max wrong answers reached.`);
                return;
            }

            if (state.step === 'cpf') {
                const documentNumber = extractDocumentNumber(text);
                if (!state.cpf && documentNumber) {
                    state.cpf = documentNumber;
                    state.step = 'email';
                    await client.sendMessage(message.from, 'Obrigado! Agora informe seu e-mail, por gentiliza:');
                    console.log(`[${accountId}] ✅ CPF received from ${message.from}`);
                } else if (!state.cpf) {
                    state.invalidCpfAttempts += 1;
                    if (state.invalidCpfAttempts > MAX_WRONG_ANSWERS) {
                        state.blocked = true;
                        console.log(`[${accountId}] 🛑 Max CPF attempts exceeded for ${message.from}.`);
                        return;
                    }
                    await client.sendMessage(message.from, 'Para continuarmos, por favor informe seu CPF, conforme as leis da LGPD.');
                    if (state.invalidCpfAttempts === MAX_WRONG_ANSWERS) {
                        state.blocked = true;
                        console.log(`[${accountId}] 🛑 Max CPF attempts reached for ${message.from}. Blocking further replies.`);
                    }
                } else {
                    await client.sendMessage(message.from, 'Estamos aguardando seu e-mail para continuar.');
                }
            } else if (state.step === 'email') {
                if (!state.email) {
                    state.email = text;
                    state.step = 'done';
                    const phoneNumber = await resolvePhoneNumber(client, message.from);
                    if (!phoneNumber) {
                        throw new Error(`Unable to resolve phone number for ${message.from}`);
                    }
                    console.log(`[${accountId}] 📌 Lead captured from ${message.from}: CPF=${state.cpf} Email=${state.email}`);
                    await appendLeadToSheet(phoneNumber, state.cpf, state.email);
                    await client.sendMessage(message.from, 'Obrigado! Um especialista entrará em contato em breve.');
                } else {
                    await client.sendMessage(message.from, 'Já recebemos seus dados. Em breve entraremos em contato.');
                }
            } else {
                state.postCompletionReplies += 1;
                if (state.postCompletionReplies > MAX_WRONG_ANSWERS) {
                    state.blocked = true;
                    console.log(`[${accountId}] 🛑 Max post-completion replies reached for ${message.from}. Blocking further replies.`);
                    return;
                }
                await client.sendMessage(message.from, 'Já recebemos seus dados. Em breve entraremos em contato.');
                if (state.postCompletionReplies === MAX_WRONG_ANSWERS) {
                    state.blocked = true;
                    console.log(`[${accountId}] 🛑 Max post-completion replies reached for ${message.from}. Blocking further replies.`);
                }
            }
            console.log(`[${accountId}] ✅ Auto-replied to ${message.from}`);
        } catch (error) {
            console.error(`[${accountId}] ❌ Error replying to ${message.from}:`, error.message);
        }
    }
});

// Event: Loading screen
client.on('loading_screen', (percent, message) => {
    console.log(`[${accountId}] Loading... ${percent}%`);
});

// Initialize the client
console.log(`[${accountId}] 🚀 Starting WhatsApp client...\n`);
client.initialize();

// Handle process termination
process.on('SIGINT', async () => {
    console.log(`\n[${accountId}] Shutting down...`);
    await client.destroy();
    process.exit(0);
});
