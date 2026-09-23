/**
 * Logging: one JSONL line per event plus a readable console line.
 * No secrets are ever logged — only public mints, prices and signatures.
 */

import fs from 'node:fs';
import path from 'node:path';

const COLOURS = {
  buy: '\x1b[32m', sell: '\x1b[35m', skip: '\x1b[90m',
  info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m',
};

export function createLogger({ file, quiet = false, colour = true } = {}) {
  let stream = null;
  if (file) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    stream = fs.createWriteStream(path.resolve(file), { flags: 'a' });
  }

  const write = (event) => {
    const line = { ts: new Date(event.at ?? Date.now()).toISOString(), ...event };
    if (stream) stream.write(`${JSON.stringify(line)}\n`);
    if (quiet) return;
    const tint = colour ? (COLOURS[event.kind] ?? COLOURS.info) : '';
    const reset = colour ? COLOURS.reset : '';
    process.stdout.write(`${tint}${format(line)}${reset}\n`);
  };

  return {
    event: write,
    info: (message, extra = {}) => write({ kind: 'info', message, ...extra }),
    warn: (message, extra = {}) => write({ kind: 'warn', message, ...extra }),
    error: (message, extra = {}) => write({ kind: 'error', message, ...extra }),
    close: () => stream?.end(),
  };
}

function format(line) {
  const time = line.ts.slice(11, 19);
  switch (line.kind) {
    case 'buy':
      return `${time}  BUY   ${pad(line.symbol, 10)} $${fmt(line.costUsd)} @ ${fmt(line.price, 8)}`
        + `  cat=${fmt(line.catScore, 2)} run=${fmt(line.runnerScore, 2)}`
        + (line.signature ? `  tx=${line.signature.slice(0, 8)}…` : '');
    case 'sell':
      return `${time}  SELL  ${pad(line.symbol, 10)} $${fmt(line.proceedsUsd)} @ ${fmt(line.price, 8)}`
        + `  pnl=${line.pnlUsd >= 0 ? '+' : ''}${fmt(line.pnlUsd)}  (${line.reason})`
        + (line.signature ? `  tx=${line.signature.slice(0, 8)}…` : '');
    case 'skip':
      return `${time}  skip  ${pad(line.symbol, 10)} ${line.reason}`;
    default:
      return `${time}  ${String(line.kind).toUpperCase().padEnd(5)} ${line.message ?? ''}`;
  }
}

const pad = (value, width) => String(value ?? '').padEnd(width).slice(0, width);
const fmt = (value, digits = 2) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—');
