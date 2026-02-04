// lid_to_phone.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

/**
 * @param {import('whatsapp-web.js').Client} client
 * @param {string} lid e.g. "ABC123@lid"
 * @returns {Promise<string|null>} phone number (pn) or null
 */
async function getPhoneFromLid(client, lid) {
  if (!lid || !lid.endsWith('@lid')) {
    throw new Error('Usage: lid must look like "ABC123@lid"');
  }

  // Returns an array like: [{ lid: "...@lid", pn: "5511999999999" }]
  const results = await client.getContactLidAndPhone([lid]);
  return results?.[0]?.pn ?? null; // <-- correct JS syntax
}

const client = new Client({
  authStrategy: new LocalAuth(), // keeps session so you scan once
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('\nScan the QR in WhatsApp → Linked devices\n');
});

client.on('ready', async () => {
  try {
    const lid = process.argv[2];
    if (!lid) throw new Error('Run: node lid_to_phone.js "ABC123@lid"');

    const phone = await getPhoneFromLid(client, lid);
    console.log('Phone:', phone);
  } catch (err) {
    console.error('Error:', err?.message || err);
  } finally {
    await client.destroy();
  }
});

client.initialize();
