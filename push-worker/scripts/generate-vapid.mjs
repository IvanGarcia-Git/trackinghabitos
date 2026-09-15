// Genera un par de claves VAPID (P-256) en formato base64url, el mismo que usa web-push.
import { webcrypto } from 'node:crypto';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await webcrypto.subtle.exportKey('raw', kp.publicKey);
const jwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
console.log(JSON.stringify({ publicKey: b64url(pub), privateKey: jwk.d }, null, 2));
