import pkg from 'whatsapp-web.js';
const { Client ,LocalAuth} = pkg;
import qrode from "qrcode-terminal";


const client = new Client({
    authStrategy: new LocalAuth(),
     puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});



client.initialize();