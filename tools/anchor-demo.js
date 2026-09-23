#!/usr/bin/env node
/**
 * Offline demonstration of the audit trail.
 *
 * Shows the exact memo bytes the devnet executor sends, and shows the hash
 * chain rejecting a tampered record. Needs no key and no network, so it runs
 * anywhere; `catnip anchor-selftest` does the same thing for real against
 * devnet once the wallet has free test SOL.
 */

import { buildRecord, hashRecord, MEMO_TAG } from '../src/exec/devnet.js';

const AT = Date.UTC(2026, 8, 24, 3, 14, 0);

const fills = [
  ['buy', { mint: 'CatN1pRunner1111111111111111111111111111111', symbol: 'MEOWFI', price: 0.00008038, qty: 1119682, costUsd: 90, feesUsd: 0.29, at: AT }, { c: 1, r: 0.61 }],
  ['sell', { mint: 'CatN1pRunner1111111111111111111111111111111', symbol: 'MEOWFI', price: 0.0001233, qty: 1119682, proceedsUsd: 138.05, feesUsd: 0.43, at: AT + 2_400_000 }, { why: 'take profit 54.6%' }],
];

let prev = 'genesis';
const chain = [];
process.stdout.write('the memo each decision writes to devnet\n');
process.stdout.write(`${'-'.repeat(74)}\n`);

for (const [kind, fill, extra] of fills) {
  const record = buildRecord(kind, fill, extra);
  const hash = hashRecord(record, prev);
  const memo = `${MEMO_TAG}:${prev}:${hash}:${JSON.stringify(record)}`;
  chain.push({ record, prev, hash });
  process.stdout.write(`${memo}\n  (${Buffer.byteLength(memo)} bytes)\n\n`);
  prev = hash;
}

process.stdout.write(`${'-'.repeat(74)}\nverifying the chain\n`);
for (const [index, entry] of chain.entries()) {
  const ok = hashRecord(entry.record, entry.prev) === entry.hash
    && (index === 0 || chain[index - 1].hash === entry.prev);
  process.stdout.write(`  link ${index}  ${ok ? 'OK' : 'BROKEN'}\n`);
}

process.stdout.write('\nnow an operator quietly edits the losing trade to look like a win\n');
const tampered = { ...chain[1].record, u: 999 };
const ok = hashRecord(tampered, chain[1].prev) === chain[1].hash;
process.stdout.write(`  link 1  ${ok ? 'OK' : 'BROKEN - hash does not match the on-chain record'}\n`);
process.stdout.write('\nthe chain is public. the log cannot be rewritten after the fact.\n');
