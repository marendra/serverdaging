import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CloudTasksClient } from '@google-cloud/tasks';

admin.initializeApp();
const tasksClient = new CloudTasksClient();

exports.onTextEntryCreate = functions.firestore.document("waMsgs/{msgId}").onCreate(async (snapshot:admin.firestore.DocumentSnapshot, context) => {
    const data = snapshot.data();

    const docId = context.params.docId;
    const project = 'daging-data'; // Replace with your project ID
    const location = 'asia-southeast2'; // e.g., 'us-central1'
    const queue = 'extractPrices';
    const parent = tasksClient.queuePath(project, location, queue);
    const taskPayload: TaskPayload = { docId: docId };

}
)