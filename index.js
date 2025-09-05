import pkg from 'whatsapp-web.js';
import admin from 'firebase-admin';
import {getFirestore} from "firebase-admin/firestore";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import moment from 'moment';
const { Client ,LocalAuth} = pkg;

// Helper to get the current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const syncingGroups = new Set();
// Construct the full path to the JSON file
const jsonPath = path.join(__dirname, './daging.json');

// Read the file synchronously (common for config files at startup)
let serviceAccount;
try {
  const fileContent = fs.readFileSync(jsonPath, 'utf8');
  serviceAccount = JSON.parse(fileContent);
} catch (error) {
  console.error("Error reading or parsing daging.json:", error);
  process.exit(1); // Exit if loading fails
}



admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Optionally, you can add other Firebase config here.
});
let targetGroupId = '';
const db = getFirestore();

import qrcode from "qrcode-terminal";


const client = new Client({
    authStrategy: new LocalAuth(),
     puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on("ready",async ()=> {

    console.log("Client is ready!");
    const targetGroupId = "120363316186563669@g.us";

    // Call the sync function on ready
    await syncMissedMessages(targetGroupId);
})

    client.on('message', async message => {
try {
        // Retrieve chat details:
        const chat = await message.getChat();

        // Check if the message is coming from the target group:
        if (chat.id._serialized === "120363316186563669@g.us") {
            console.log("Received message from target group:");

            // Write the message into Cloud Firestore using milliseconds since epoch:
            await db.collection("groupMessages").add({
                groupId: chat.id._serialized,
                groupName: chat.name,
                message: message.body,
                readIndia:false,
                readAustralia:false,
                readUsa:false,
                readBrazil:false,
                timestamp: Date.now() // Timestamp in milliseconds since epoch
            });

            console.log("Message stored in Cloud Firestore. on  " + new Date(Date.now()).toLocaleString() + " " + new Date(Date.now()).toLocaleTimeString());
        }
    } catch (error) {
        console.error("Error processing or saving message:", error);
    }
    });

client.on("qr",qr=>{
      qrcode.generate(qr, {small: true});
})

async function syncMissedMessages(groupId) {
  try {
    console.log(`Attempting to sync missed messages for group ${groupId}...`);

    const chat = await client.getChatById(groupId);
    if (!chat) {
      console.log(`Group with ID ${groupId} not found.`);
      return;
    }

    // Get last synced ts (ms). If none, default to 7d ago.
    const latestSnap = await db.collection("groupMessages")
      .where("groupId", "==", groupId)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    let lastSyncedTsMs = latestSnap.empty
      ? Date.now() - 7 * 24 * 60 * 60 * 1000
      : Number(latestSnap.docs[0].data().timestamp) || 0;

    console.log(
      latestSnap.empty
        ? `No previous messages. Using ~7 days ago.`
        : `Latest stored ts: ${new Date(lastSyncedTsMs).toLocaleString()}`
    );

    // Fetch from WA
    const LIMIT_TOTAL = 2000; // optional higher ceiling
    let allFetched = [];
    let beforeMessageId;
    let hasMore = true;

    while (hasMore && allFetched.length < LIMIT_TOTAL) {
      const page = await chat.fetchMessages({ limit: 100, before: beforeMessageId });
      if (page.length === 0) break;

      allFetched.push(...page);
      beforeMessageId = page[page.length - 1].id;

      const oldestInPageMs = moment.unix(page[page.length - 1].timestamp).valueOf();
      if (oldestInPageMs < lastSyncedTsMs) hasMore = false;
    }

    allFetched.sort((a, b) => a.timestamp - b.timestamp);
    const missed = allFetched.filter(m => moment.unix(m.timestamp).valueOf() > lastSyncedTsMs);

    console.log(`Found ${missed.length} missed messages from WhatsApp Web.`);

    if (missed.length === 0) {
      console.log("No new missed messages to store.");
      return;
    }

    // Write in batches of <=500 with deterministic IDs to avoid duplicates
    const CHUNK = 450; // safe margin under 500
    let written = 0;

    for (let i = 0; i < missed.length; i += CHUNK) {
      const slice = missed.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const msg of slice) {
        const tsMs = moment.unix(msg.timestamp).valueOf();
        const messageId = msg.id?._serialized ?? String(msg.id);
        const docId = `${chat.id._serialized}_${messageId}`;
        const ref = db.collection("groupMessages").doc(docId);

        // `set` with deterministic ID makes the operation idempotent:
        //   - first time creates the doc
        //   - next runs just overwrite the same doc (no duplicates)
        // If you prefer "create once or skip", swap to `batch.create(ref, data)` and catch ALREADY_EXISTS.
        batch.set(ref, {
          messageId,
          groupId: chat.id._serialized,
          groupName: chat.name || "",
          message: msg.body || "",
          readIndia: false,
          readAustralia: false,
          readUsa: false,
          readBrazil: false,
          timestamp: tsMs,
        }, { merge: false });
      }

      await batch.commit();
      written += slice.length;
      console.log(`Committed ${written}/${missed.length} messages...`);
    }

    console.log(`Done. Stored/updated ${written} messages (duplicates prevented by doc IDs).`);
  } catch (err) {
    console.error("Error syncing missed messages:", err);
  }
}

client.initialize();