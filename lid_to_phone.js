// lid_to_phone.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

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
    const outputFile = process.argv[3] || 'lid_to_phone_output.txt';
    if (!lid) throw new Error('Run: node lid_to_phone.js "ABC123@lid" [output_file]');

    const phone = await getPhoneFromLid(client, lid);
    if (!phone) {
      throw new Error(`No phone number found for lid ${lid}`);
    }

    const formatted = `${phone}@c.us`;
    console.log(`NUMBER: ${formatted}`);

    const outputPath = path.resolve(process.cwd(), outputFile);
    fs.writeFileSync(outputPath, phone, 'utf8');
    console.log(`Saved number (without @c.us) to ${outputPath}`);
  } catch (err) {
    console.error('Error:', err?.message || err);
  } finally {
    await client.destroy();
  }
});

client.initialize();
