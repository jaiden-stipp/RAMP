import { mkdirSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, rmdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256 } from './protocol.js';
import { stableJson } from './lockfile.js';

export function readJournal(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  if (text && !text.endsWith('\n')) throw new Error(`Incomplete journal record: ${path}`);
  const records = text ? text.slice(0, -1).split('\n').map(line => JSON.parse(line)) : [];
  let previousHash = null;
  records.forEach((record, index) => {
    const { hash, ...data } = record;
    if (data.sequence !== index + 1 || data.previousHash !== previousHash || hash !== sha256(stableJson(data)) || !Number.isFinite(Date.parse(data.time))) throw new Error(`Invalid journal chain at record ${index + 1}: ${path}`);
    previousHash = hash;
  });
  return records;
}

export function appendJournal(path, payload, check) {
  mkdirSync(dirname(path), { recursive: true });
  const mutex = `${path}.mutex`;
  try { mkdirSync(mutex); } catch (e) { if (e.code === 'EEXIST') throw new Error(`Journal busy: ${path}; retry after the writer releases its lock`); throw e; }
  try {
    const history = readJournal(path);
    check?.([...history.map(r => r.payload), payload]);
    const record = { sequence: history.length + 1, time: new Date().toISOString(), previousHash: history.at(-1)?.hash ?? null, payload };
    record.hash = sha256(stableJson(record));
    const fd = openSync(path, 'a');
    try { writeSync(fd, `${JSON.stringify(record)}\n`, null, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
    return record;
  } finally { rmdirSync(mutex); }
}
