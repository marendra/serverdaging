import pkg from 'whatsapp-web.js';
import admin from 'firebase-admin';
import {getFirestore} from "firebase-admin/firestore";

const { Client ,LocalAuth} = pkg;
import serviceAccount  from "./daging.json" with {type:'json'}

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
            console.log("Received message from target group:", message.body);

            // Write the message into Cloud Firestore using milliseconds since epoch:
            await db.collection("groupMessages").add({
                groupId: chat.id._serialized,
                groupName: chat.name,
                message: message.body,
                read:false,
                timestamp: Date.now() // Timestamp in milliseconds since epoch
            });

            console.log("Message stored in Cloud Firestore.");
        }
    } catch (error) {
        console.error("Error processing or saving message:", error);
    }
    });

client.on("qr",qr=>{
      qrcode.generate(qr, {small: true});
})

client.initialize();