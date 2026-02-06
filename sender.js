const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

// Load contacts from JSON file
const contactsPath = path.join(__dirname, contactsFile);

// Error reporting configuration
const ERROR_REPORT_URL = requireEnv('ERROR_REPORT_URL');
const ERROR_REPORT_AUTH_TOKEN = requireEnv('ERROR_REPORT_AUTH_TOKEN');
const ERROR_REPORT_HEADER_KEY = requireEnv('ERROR_REPORT_HEADER_KEY');
const ERROR_REPORT_HEADER_VALUE = requireEnv('ERROR_REPORT_HEADER_VALUE');

// Function to report error to endpoint
async function reportError(phone) {
    const today = new Date().toISOString().split('T')[0];
    
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

// Function to safely read contacts.json
function loadContacts() {
    try {
        const contactsData = fs.readFileSync(contactsPath, 'utf8');
        return JSON.parse(contactsData);
    } catch (error) {
        console.error(`[${accountId}] ❌ Error loading ${contactsFile}:`, error.message);
        throw error;
    }
}

// Function to safely update a contact's status in the shared file
function markContactAsSent(phoneNumber, success = true) {
    const maxRetries = 5;
    const retryDelay = 100; // ms
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Read the latest state
            const contacts = loadContacts();
            
            // Find and update the contact
            const contactIndex = contacts.findIndex(c => c.phone === phoneNumber);
            if (contactIndex === -1) {
                console.error(`[${accountId}] ⚠️  Contact ${phoneNumber} not found in ${contactsFile}`);
                return false;
            }
            
            // Verify this contact is assigned to this account
            if (contacts[contactIndex].sentBy !== accountId) {
                console.error(`[${accountId}] ⚠️  Contact ${phoneNumber} is not assigned to this account (assigned to: ${contacts[contactIndex].sentBy})`);
                return false;
            }
            
            // Update the contact
            contacts[contactIndex].sent = success;
            contacts[contactIndex].sentAt = success ? new Date().toISOString() : null;
            
            // Write back atomically
            const tempPath = contactsPath + '.tmp';
            fs.writeFileSync(tempPath, JSON.stringify(contacts, null, 2), 'utf8');
            fs.renameSync(tempPath, contactsPath);
            
            console.log(`[${accountId}] 💾 Marked ${phoneNumber} as ${success ? 'sent' : 'failed'} in ${contactsFile}`);
            return true;
            
        } catch (error) {
            if (attempt === maxRetries - 1) {
                console.error(`[${accountId}] ❌ Failed to update ${contactsFile} after ${maxRetries} attempts:`, error.message);
                return false;
            }
            // Wait before retrying
            const jitter = Math.random() * retryDelay;
            const delay = retryDelay * (attempt + 1) + jitter;
            console.log(`[${accountId}] ⚠️  Retry ${attempt + 1}/${maxRetries} in ${delay.toFixed(0)}ms...`);
            // Synchronous sleep
            const start = Date.now();
            while (Date.now() - start < delay) {
                // busy wait
            }
        }
    }
    return false;
}

// Initialize the client with unique clientId
const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: accountId
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Function to send messages and exit
async function sendMessagesAndExit() {
    // Load contacts and filter for this account only
    const allContacts = loadContacts();
    
    // Filter for contacts assigned to this account that haven't been sent
    const myContacts = allContacts.filter(c => 
        c.sentBy === accountId && c.sent === false
    );
    
    console.log(`[${accountId}] 📊 Found ${myContacts.length} contacts assigned to this account (${allContacts.length} total)`);
    
    if (myContacts.length === 0) {
        console.log(`[${accountId}] ℹ️  No unsent messages assigned to this account`);
        await client.destroy();
        process.exit(0);
    }
    
    for (const contact of myContacts) {
        const { phone, message } = contact;
        
        try {
            const chatId = phone.replace('+', '') + '@c.us';
            
            console.log(`[${accountId}] 📤 Sending to ${phone}...`);
            await client.sendMessage(chatId, message);
            console.log(`[${accountId}] ✅ Message sent to ${phone}`);
            markContactAsSent(phone, true);
            
        } catch (error) {
            console.error(`[${accountId}] ❌ Error sending to ${phone}:`, error.message);
            await reportError(phone);
            markContactAsSent(phone, false);
        }
    }
    
    // Exit after sending
    console.log(`[${accountId}] 🏁 Finished sending. Exiting...`);
    await client.destroy();
    process.exit(0);
}

// Event: Client is ready
client.on('ready', async () => {
    console.log(`[${accountId}] ✅ Client ready`);
    
    try {
        await sendMessagesAndExit();
    } catch (error) {
        console.error(`[${accountId}] ❌ Error:`, error);
        process.exit(1);
    }
});

// Event: Authentication failure
client.on('auth_failure', (msg) => {
    console.error(`[${accountId}] ❌ Authentication failed:`, msg);
    process.exit(1);
});

// Initialize
console.log(`[${accountId}] 🚀 Starting sender...`);
client.initialize();

// Timeout safety
setTimeout(() => {
    console.error(`[${accountId}] ⏱️  Timeout - exiting`);
    process.exit(1);
}, 60000); // 60 second timeout
