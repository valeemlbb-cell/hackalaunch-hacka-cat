/**
 * Devnet executor: the on-chain audit trail.
 *
 * Why this exists
 * ---------------
 * A trading agent you cannot audit is a screenshot. CATNIP writes every single
 * decision it makes to Solana devnet as an SPL Memo transaction, so the trade
 * log is not a local JSON file the operator could have edited — it is a chain
 * of signatures anyone can pull from a public RPC and verify, in order.
 *
 * Each memo carries a hash chain (prevHash -> hash), so a removed or reordered
 * entry breaks verification. `catnip verify` walks the chain back from devnet.
 *
 * Safety
 * ------
 * - devnet ONLY; the constructor refuses any RPC URL that mentions mainnet.
 * - the keypair is read from a file path given in the environment. No key, no
 *   seed phrase and no path default ever lives in this repository.
 * - the wallet only pays devnet transaction fees (free SOL from the faucet).
 *   Position sizing and PnL stay in the paper engine.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createPaperExecutor } from './paper.js';

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const MEMO_TAG = 'CATNIP1';
const MAX_MEMO_BYTES = 560;

/** Load a Solana keypair from a JSON byte-array file (solana-keygen format). */
export function loadKeypair(filePath) {
  if (!filePath) {
    throw new Error(
      'CATNIP_KEYPAIR is not set. Create a devnet key with '
      + '`solana-keygen new -o ~/.config/solana/catnip-devnet.json` and point '
      + 'CATNIP_KEYPAIR at it. Never commit it.',
    );
  }
  if (!fs.existsSync(filePath)) throw new Error(`keypair file not found: ${filePath}`);
  const bytes = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error(`keypair file ${filePath} is not a 64-byte secret key array`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

/** Deterministic hash of a memo record, chained to the previous one. */
export function hashRecord(record, prevHash) {
  const payload = JSON.stringify({ ...record, prevHash });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/** Build the compact record written into the memo. */
export function buildRecord(kind, fill, extra = {}) {
  const round = (value, digits) => Number(Number(value).toFixed(digits));
  return {
    v: 1,
    k: kind, // 'buy' | 'sell'
    m: fill.mint,
    s: fill.symbol,
    p: round(fill.price, 12),
    q: round(fill.qty, 6),
    u: round(kind === 'buy' ? fill.costUsd : fill.proceedsUsd, 4),
    f: round(fill.feesUsd, 4),
    t: fill.at,
    ...extra,
  };
}

function assertDevnet(rpcUrl, cluster) {
  if (/mainnet/i.test(String(rpcUrl)) || cluster === 'mainnet-beta') {
    throw new Error('devnet executor refuses a mainnet endpoint — this agent never touches mainnet funds');
  }
}

/**
 * Create the devnet executor. It delegates fill maths to the paper engine and
 * adds the on-chain anchor.
 *
 * @param {object} config
 * @param {object} [options]
 * @param {string} [options.keypairPath] defaults to process.env.CATNIP_KEYPAIR
 * @param {boolean} [options.required] when false, an anchor failure is logged
 *   instead of thrown (the agent keeps trading on paper)
 */
export function createDevnetExecutor(config, options = {}) {
  assertDevnet(config.rpcUrl, config.cluster);

  const keypair = loadKeypair(options.keypairPath ?? process.env.CATNIP_KEYPAIR);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const paper = createPaperExecutor(config);
  const required = options.required !== false;
  let prevHash = options.genesisHash ?? 'genesis';

  async function anchor(kind, fill, extra) {
    const record = buildRecord(kind, fill, extra);
    const hash = hashRecord(record, prevHash);
    const memo = `${MEMO_TAG}:${prevHash}:${hash}:${JSON.stringify(record)}`;
    const bytes = Buffer.from(memo, 'utf8');
    if (bytes.length > MAX_MEMO_BYTES) {
      throw new Error(`memo too large (${bytes.length} bytes)`);
    }

    const transaction = new Transaction().add(new TransactionInstruction({
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
      programId: MEMO_PROGRAM_ID,
      data: bytes,
    }));

    const signature = await sendAndConfirmTransaction(
      connection, transaction, [keypair], { commitment: 'confirmed' },
    );
    prevHash = hash;
    return { signature, hash, memo, explorer: explorerUrl(signature) };
  }

  async function withAnchor(kind, fill, extra) {
    try {
      const anchored = await anchor(kind, fill, extra);
      return { ...fill, anchor: anchored };
    } catch (error) {
      if (required) throw error;
      return { ...fill, anchor: { error: error.message } };
    }
  }

  return {
    name: 'devnet',
    anchored: true,
    publicKey: keypair.publicKey.toBase58(),
    connection,
    get chainHead() { return prevHash; },

    async balanceSol() {
      return (await connection.getBalance(keypair.publicKey)) / 1e9;
    },

    async buy(args) {
      const fill = await paper.buy(args);
      return withAnchor('buy', fill, { c: args.catScore, r: args.runnerScore });
    },

    async sell(args) {
      const fill = await paper.sell(args);
      return withAnchor('sell', fill, { why: String(args.reason ?? '').slice(0, 48) });
    },
  };
}

export function explorerUrl(signature, cluster = 'devnet') {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/**
 * Pull this wallet's CATNIP memos back off devnet and verify the hash chain.
 * @returns {{records:Array, valid:boolean, broken:number|null, count:number}}
 */
export async function verifyChain(connection, publicKey, limit = 100) {
  const signatures = await connection.getSignaturesForAddress(new PublicKey(publicKey), { limit });
  const records = [];
  for (const entry of signatures.reverse()) {
    const tx = await connection.getTransaction(entry.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const memo = extractMemo(tx);
    if (!memo || !memo.startsWith(`${MEMO_TAG}:`)) continue;
    const [, prev, hash, ...rest] = memo.split(':');
    let record = null;
    try { record = JSON.parse(rest.join(':')); } catch { /* ignore junk */ }
    records.push({ signature: entry.signature, prev, hash, record });
  }

  let broken = null;
  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    if (!entry.record) { broken = index; break; }
    if (hashRecord(entry.record, entry.prev) !== entry.hash) { broken = index; break; }
    if (index > 0 && records[index - 1].hash !== entry.prev) { broken = index; break; }
  }
  return { records, valid: broken === null, broken, count: records.length };
}

function extractMemo(tx) {
  const logs = tx?.meta?.logMessages ?? [];
  for (const line of logs) {
    const match = line.match(/Program log: Memo \(len \d+\): "(.*)"$/);
    if (match) return match[1].replace(/\\"/g, '"');
  }
  return null;
}
