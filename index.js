const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

// Error reporting configuration
const ERROR_REPORT_URL = 'https://Bad-monk-walking.ngrok-free.app/errorreport';
const AUTH_TOKEN = 'bearman';

// Function to report error to endpoint
async function reportError(phone) {
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    try {
        await axios.post(ERROR_REPORT_URL, {
            data: phone,
            exdata: today
        }, {
            headers: {
                'headerman': 'headerwoman',
                'Authorization': `Bearer ${AUTH_TOKEN}`,
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
            
            // Write updated contacts back to file
            fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2), 'utf8');
            console.log(`[${accountId}] 💾 Marked ${phoneNumber} as sent in ${contactsFile}`);
        }
    } catch (error) {
        console.error(`[${accountId}] ⚠️  Failed to update ${contactsFile}:`, error.message);
    }
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
                console.log(`[${accountId}] ⏳ Waiting ${delay}ms before next message...\n`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (i < unsentContacts.length - 1) {
                // Default delay if not specified
                console.log(`[${accountId}] ⏳ Waiting 2000ms (default) before next message...\n`);
                await new Promise(resolve => setTimeout(resolve, 2000));
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

function getLeadState(chatId) {
    if (!leadCapture.has(chatId)) {
        leadCapture.set(chatId, { step: 'cpf', cpf: null, email: null });
    }
    return leadCapture.get(chatId);
}

function isValidCpfFormat(value) {
    return /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(value);
}

function isValidEmailFormat(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

client.on('message_create', async (message) => {
    // Only reply to messages we receive (not messages we send)
    if (!message.fromMe && message.body) {
        try {
            console.log(`[${accountId}] 📨 Received message from ${message.from}: "${message.body}"`);
            const state = getLeadState(message.from);
            const text = message.body.trim();

            if (state.step === 'cpf') {
                if (!state.cpf && isValidCpfFormat(text)) {
                    state.cpf = text;
                    state.step = 'email';
                    await client.sendMessage(message.from, 'Obrigado! Agora, por favor, informe seu e-mail:');
                    console.log(`[${accountId}] ✅ CPF received from ${message.from}`);
                } else if (!state.cpf) {
                    await client.sendMessage(message.from, 'Para continuarmos, por favor informe seu CPF (apenas números ou com pontuação).');
                } else {
                    await client.sendMessage(message.from, 'Estamos aguardando seu e-mail para continuar.');
                }
            } else if (state.step === 'email') {
                if (!state.email && isValidEmailFormat(text)) {
                    state.email = text;
                    state.step = 'done';
                    console.log(`[${accountId}] 📌 Lead captured from ${message.from}: CPF=${state.cpf} Email=${state.email}`);
                    await client.sendMessage(message.from, 'Obrigado! Um especialista entrará em contato em breve.');
                } else if (!state.email) {
                    await client.sendMessage(message.from, 'E-mail inválido. Pode informar novamente?');
                } else {
                    await client.sendMessage(message.from, 'Já recebemos seus dados. Em breve entraremos em contato.');
                }
            } else {
                await client.sendMessage(message.from, 'Se precisar de ajuda adicional, é só avisar!');
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
