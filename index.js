import pkg from 'whatsapp-web.js';
import admin from 'firebase-admin';
import {getFirestore} from "firebase-admin/firestore";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


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

client.initialize();