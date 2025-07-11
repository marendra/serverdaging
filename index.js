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

        // 1. Get the latest timestamp from Firestore for this group
        const latestFirestoreMessageSnapshot = await db.collection("groupMessages")
            .where("groupId", "==", groupId)
            .orderBy("timestamp", "desc")
            .limit(1)
            .get();

        let lastSyncedTimestamp = 0; // Default to epoch if no messages found
        if (!latestFirestoreMessageSnapshot.empty) {
            lastSyncedTimestamp = latestFirestoreMessageSnapshot.docs[0].data().timestamp;
            console.log(`Latest message in Firestore for ${groupId} has timestamp: ${new Date(lastSyncedTimestamp).toLocaleString()}`);
        } else {
            console.log(`No previous messages found in Firestore for group ${groupId}. Fetching recent history.`);
            // If no messages exist, fetch from a reasonable past, e.g., 7 days ago
            lastSyncedTimestamp = moment().subtract(7, 'days').valueOf();
        }

        // Ensure we fetch a reasonable window, e.g., messages newer than the last synced, but not too far back
        // WhatsApp Web usually holds a limited history (e.g., last few thousand messages).
        // Fetching too many can be slow and problematic.
        const messagesToFetchLimit = 1000; // Adjust this limit based on group activity and desired history
        let allFetchedMessages = [];
        let hasMore = true;
        let beforeMessageId = undefined; // For pagination

        console.log(`Fetching up to ${messagesToFetchLimit} messages from WhatsApp Web...`);

        // Loop to fetch messages from WhatsApp Web until we have enough or hit limits
        while (hasMore && allFetchedMessages.length < messagesToFetchLimit) {
            const fetched = await chat.fetchMessages({ limit: 100, before: beforeMessageId }); // Fetch in chunks
            if (fetched.length === 0) {
                hasMore = false;
                break;
            }

            allFetchedMessages.push(...fetched);
            beforeMessageId = fetched[fetched.length - 1].id;


            if (moment.unix(fetched[fetched.length - 1].timestamp).valueOf() < lastSyncedTimestamp) {
                hasMore = false;
            }
        }

        // Sort messages by timestamp to ensure correct order
        allFetchedMessages.sort((a, b) => a.timestamp - b.timestamp);

        // Filter out messages that are older than or equal to the last synced timestamp
        const missedMessages = allFetchedMessages.filter(msg => {
            const msgTimestampMs = moment.unix(msg.timestamp).valueOf(); // Convert Unix timestamp (seconds) to milliseconds
            return msgTimestampMs > lastSyncedTimestamp;
        });

        console.log(`Found ${missedMessages.length} missed messages from WhatsApp Web.`);

        if (missedMessages.length > 0) {
            // Store missed messages in Firestore in batches (Firestore has batch write limits)
            const batch = db.batch();
            let batchCount = 0;å
            const batchSize = 500; // Max batch size is 500 operations

            for (const msg of missedMessages) {
                const docRef = db.collection("groupMessages").doc(); // Let Firestore auto-generate ID
                batch.set(docRef, {
                    groupId: chat.id._serialized,
                    groupName: chat.name,
                    message: msg.body,
                    readIndia: false,
                    readAustralia: false,
                    readUsa: false,
                    readBrazil: false,
                    timestamp: moment.unix(msg.timestamp).valueOf() // Store in milliseconds
                });
                batchCount++;

                if (batchCount === batchSize) {
                    await batch.commit();
                    console.log(`Committed a batch of ${batchSize} missed messages.`);
                    batchCount = 0;
                }
            }
            if (batchCount > 0) {
                await batch.commit();
                console.log(`Committed final batch of ${batchCount} missed messages.`);
            }
            console.log(`Successfully stored ${missedMessages.length} missed messages in Cloud Firestore.`);
        } else {
            console.log("No new missed messages to store from WhatsApp Web.");
        }

    } catch (error) {
        console.error("Error syncing missed messages:", error);
    }
}

client.initialize();