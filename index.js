import pkg from 'whatsapp-web.js';
import admin from 'firebase-admin';
import {getFirestore} from "firebase-admin/firestore";

const { Client ,LocalAuth} = pkg;
const serviceAccount  = require("./daging.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Optionally, you can add other Firebase config here.
});

const db = getFirestore();

import qrcode from "qrcode-terminal";


const client = new Client({
    authStrategy: new LocalAuth(),
     puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on("ready",()=>{
    console.log("Client is ready!");
})

client.on('message', async message => {
    const chat = await message.getChat();

    // Check if it's a group message and matches the specific group name
    if (chat.isGroup && chat.name === "LIST HARGA DARI CUSTOUMER") {
        console.log('Message from target group:', message.body);

        // Log message details

        await db.collection("waMsg").add({
            message: message.body,
            timestamp: message.timestamp,
            type: message.type,
        })

        // Handle different types of messages
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            console.log('Media received:', media.mimetype);
        }

        // Your message handling logic here
        // ...
    }
});

client.on("qr",qr=>{
      qrcode.generate(qr, {small: true});
})

client.initialize();