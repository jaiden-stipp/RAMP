import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
export const networkAttempts = [];
function deny(...args) { networkAttempts.push(String(args[0] ?? 'unknown request')); throw new Error('Offline conformance path attempted network access'); }
globalThis.fetch = deny;
http.request = http.get = https.request = https.get = net.connect = net.createConnection = tls.connect = deny;
syncBuiltinESMExports();
