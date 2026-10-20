// Explicitly loaded only by supplements-server.test.js in an isolated child process.
import webpush from 'web-push';
import fs from 'node:fs';
if (!process.env.TEST_SUPPLEMENT_CAPTURE) throw new Error('Missing test capture');
webpush.sendNotification = async (subscription, body) => {
  fs.appendFileSync(process.env.TEST_SUPPLEMENT_CAPTURE, JSON.stringify({ endpoint: subscription.endpoint, payload: JSON.parse(body) }) + '\n');
};
