
import {handler} from './index.js';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
const command = new GetSecretValueCommand({ SecretId: process.env.API_KEY_SECRET_NAME });
const response = await secretsClient.send(command);
const apiKey = JSON.parse(response.SecretString).API_KEY;

let event = {
  version: '2.0',
  routeKey: '$default',
  rawPath: '/start',
  rawQueryString: '',
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
  requestContext: {
    http: {
      method: 'GET',
      path: '/start',
      protocol: 'HTTP/1.1',
    },
  },
};

// let event = {
//   version: '2.0',
//   routeKey: '$default',
//   rawPath: '/status/38',
//   rawQueryString: '',
//   headers: {
//     Authorization: `Bearer ${apiKey}`,
//   },
//   requestContext: {
//     http: {
//       method: 'GET',
//       path: '/status/12345',
//       protocol: 'HTTP/1.1',
//     },
//   },
// };

handler(event).then(() => {
    console.log('done');
}).catch((err) => {
    console.error(err);
});