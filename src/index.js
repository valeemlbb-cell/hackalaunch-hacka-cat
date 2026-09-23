#!/usr/bin/env node
/**
 * CATNIP command line.
 *
 *   catnip scan      [--source fixture|live] [--deep]   what is cat and what is running, right now
 *   catnip backtest  [--file fixtures/tape.json]        replay the tape, print the stats
 *   catnip run       [--mode paper|devnet] [--ticks N]  the agent loop
 *   catnip verify                                       re-read the devnet audit chain
 *   catnip doctor                                       environment / config / RPC check
 */

import process from 'node:process';
import { Connection } from '@solana/web3.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createFixtureSource } from './market/fixture.js';
import { createDexScreenerSource } from './market/dexscreener.js';
import { createPaperExecutor } from './exec/paper.js';
import { createDevnetExecutor, verifyChain, explorerUrl } from './exec/devnet.js';
import { createAgent } from './agent.js';
import { createLogger } from './log.js';
import { catScore } from './cat/detector.js';
import { runnerScore } from './strategy/runner.js';
import { checkToken } from './risk/guards.js';
import { summarise } from './portfolio.js';

const BANNER = `
   /\\_/\\   CATNIP
  ( o.o )  an agent that trades all the cat runners
   > ^ <   devnet / paper only - never mainnet funds
`;

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) { flags[key] = true; continue; }
    flags[key] = next;
    i += 1;
  }
  return { command, flags };
}

function buildSource(flags) {
  const kind = flags.source ?? 'fixture';
  if (kind === 'live' || kind === 'dexscreener') {
    return createDexScreenerSource({ deepSweep: Boolean(flags.deep) });
  }
  return createFixtureSource({ file: flags.file });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (value, width) => String(value ?? '').padEnd(width).slice(0, width);

// --- commands --------------------------------------------------------------

async function cmdScan(config, flags) {
  const source = buildSource(flags);
  process.stdout.write(`source: ${source.name}\n`);
  // On a fixture tape, --frame N scans the Nth frame instead of the first.
  const frame = Number(flags.frame ?? 0);
  for (let skip = 0; skip < frame && source.name === 'fixture'; skip += 1) {
    await source.listTokens();
  }
  const snapshots = await source.listTokens(Date.now());
  const now = source.name === 'fixture' ? source.clock() : Date.now();

  const rows = snapshots.map((snapshot) => {
    const cat = catScore(snapshot);
    const runner = runnerScore(snapshot, now);
    const risk = checkToken(snapshot, config);
    return { snapshot, cat, runner, risk };
  }).sort((a, b) => (b.cat.score * b.runner.score) - (a.cat.score * a.runner.score));

  process.stdout.write(
    `\n${pad('SYMBOL', 12)}${pad('CAT', 7)}${pad('RUN', 7)}${pad('LIQ$', 11)}${pad('5m%', 9)}VERDICT\n`
    + `${'-'.repeat(78)}\n`,
  );
  let tradable = 0;
  for (const row of rows) {
    let verdict;
    if (!row.cat.isCat) verdict = `not a cat (${row.cat.hits.length ? row.cat.reason : 'no signal'})`;
    else if (!row.risk.pass) verdict = `BLOCKED: ${row.risk.violations[0]}`;
    else if (!row.runner.isRunner) verdict = `cat, not running (${row.runner.notes[0] ?? 'weak momentum'})`;
    else { verdict = `TRADABLE RUNNER - ${row.runner.breakdown.accelRatio}x volume`; tradable += 1; }

    process.stdout.write(
      pad(row.snapshot.symbol, 12)
      + pad(row.cat.score.toFixed(2), 7)
      + pad(row.runner.score.toFixed(2), 7)
      + pad(Math.round(row.snapshot.liquidityUsd).toLocaleString('en-US'), 11)
      + pad(row.snapshot.priceChange5m.toFixed(1), 9)
      + `${verdict}\n`,
    );
  }
  process.stdout.write(`\n${rows.length} tokens seen, ${tradable} tradable cat runners\n`);
}

async function cmdBacktest(config, flags) {
  const source = createFixtureSource({ file: flags.file });
  const executor = createPaperExecutor(config);
  const logger = createLogger({ quiet: !flags.verbose, file: flags.log });
  const agent = createAgent({ config, source, executor, logger });

  const equityCurve = [];
  while (!source.exhausted) {
    const now = source.clock();
    await agent.tick(now);
    equityCurve.push(agent.equity());
  }
  await agent.liquidate(source.clock());

  const summary = agent.summary();
  const peak = equityCurve.reduce((max, value) => Math.max(max, value), config.startingCashUsd);
  const maxDrawdownPct = equityCurve.reduce((worst, value, index) => {
    const runningPeak = Math.max(config.startingCashUsd, ...equityCurve.slice(0, index + 1));
    return Math.min(worst, ((value - runningPeak) / runningPeak) * 100);
  }, 0);

  process.stdout.write(`${BANNER}\nBACKTEST  ${source.frameCount} frames x ${source.frameSeconds}s\n`);
  process.stdout.write(`${'-'.repeat(52)}\n`);
  for (const [key, value] of Object.entries(summary)) {
    process.stdout.write(`${pad(key, 22)}${typeof value === 'number' ? value.toFixed(2) : value}\n`);
  }
  process.stdout.write(`${pad('peakEquityUsd', 22)}${peak.toFixed(2)}\n`);
  process.stdout.write(`${pad('maxDrawdownPct', 22)}${maxDrawdownPct.toFixed(2)}\n`);
  process.stdout.write(`\ntrades:\n`);
  for (const trade of agent.portfolio.trades) {
    process.stdout.write(
      `  ${pad(trade.side.toUpperCase(), 5)}${pad(trade.symbol, 11)}`
      + `@ ${trade.price.toExponential(3)}`
      + (trade.side === 'sell' ? `  pnl ${trade.pnlUsd >= 0 ? '+' : ''}${trade.pnlUsd.toFixed(2)}  (${trade.reason})` : '')
      + '\n',
    );
  }
  logger.close();
}

async function cmdRun(config, flags) {
  const mode = flags.mode ?? 'paper';
  const source = buildSource(flags);
  const logger = createLogger({ file: flags.log ?? 'logs/catnip.jsonl' });

  let executor;
  if (mode === 'devnet') {
    executor = createDevnetExecutor(config, { required: false });
    const balance = await executor.balanceSol();
    logger.info(`devnet anchor wallet ${executor.publicKey} (${balance.toFixed(4)} SOL)`);
    if (balance < 0.01) {
      logger.warn('low devnet balance — run: solana airdrop 2 ' + executor.publicKey + ' --url devnet');
    }
  } else if (mode === 'paper') {
    executor = createPaperExecutor(config);
  } else {
    throw new Error(`unknown mode "${mode}" (paper | devnet)`);
  }

  const agent = createAgent({ config, source, executor, logger });
  const maxTicks = Number(flags.ticks ?? Number.POSITIVE_INFINITY);
  const delayMs = flags.speed !== undefined ? Number(flags.speed) : config.tickSeconds * 1000;

  process.stdout.write(BANNER);
  logger.info(`source=${source.name} mode=${mode} cash=$${config.startingCashUsd}`);

  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });

  for (let tick = 0; tick < maxTicks && !stopping; tick += 1) {
    if (source.name === 'fixture' && source.exhausted) break;
    const now = source.name === 'fixture' ? source.clock() : Date.now();
    try {
      await agent.tick(now);
    } catch (error) {
      logger.error(`tick failed: ${error.message}`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  await agent.liquidate(source.name === 'fixture' ? source.clock() : Date.now());
  const summary = agent.summary();
  process.stdout.write(`\n${'-'.repeat(52)}\nRESULT\n`);
  for (const [key, value] of Object.entries(summary)) {
    process.stdout.write(`${pad(key, 22)}${typeof value === 'number' ? value.toFixed(2) : value}\n`);
  }
  if (executor.anchored) {
    process.stdout.write(`\naudit chain head: ${executor.chainHead}\n`);
    process.stdout.write(`wallet: https://explorer.solana.com/address/${executor.publicKey}?cluster=devnet\n`);
  }
  logger.close();
}

/**
 * Anchor one synthetic decision on devnet and read it straight back.
 * This is the end-to-end proof that the audit trail is real chain state and
 * not a local log file. Needs a funded devnet key (free: `solana airdrop 2`).
 */
async function cmdAnchorSelftest(config) {
  const executor = createDevnetExecutor(config, { required: true });
  const balance = await executor.balanceSol();
  process.stdout.write(`wallet  ${executor.publicKey}\nbalance ${balance.toFixed(4)} devnet SOL\n`);
  if (balance <= 0) {
    throw new Error(
      `wallet has no devnet SOL. Run:\n  solana airdrop 2 ${executor.publicKey} --url devnet\n`
      + '(devnet SOL is free test currency and has no value)',
    );
  }

  const snapshot = {
    mint: 'SelfTestMint1111111111111111111111111111111',
    symbol: 'SELFTEST', priceUsd: 0.001, liquidityUsd: 100000,
  };
  process.stdout.write('\nanchoring a BUY…\n');
  const buy = await executor.buy({
    snapshot, sizeUsd: 10, at: Date.now(), catScore: 1, runnerScore: 0.8,
  });
  process.stdout.write(`  ${buy.anchor.explorer}\n`);

  process.stdout.write('anchoring the matching SELL…\n');
  const sell = await executor.sell({
    snapshot: { ...snapshot, priceUsd: 0.0015 },
    position: { ...snapshot, qty: buy.qty, entryPrice: buy.price },
    at: Date.now(), reason: 'selftest',
  });
  process.stdout.write(`  ${sell.anchor.explorer}\n`);

  process.stdout.write('\nreading the chain back from devnet…\n');
  const result = await verifyChain(executor.connection, executor.publicKey, 20);
  process.stdout.write(
    `${result.count} anchored decisions found, hash chain `
    + `${result.valid ? 'VALID' : `BROKEN at index ${result.broken}`}\n`,
  );
  if (!result.valid || result.count < 2) process.exitCode = 1;
}

async function cmdVerify(config, flags) {
  const address = flags.address ?? process.env.CATNIP_PUBKEY;
  if (!address) {
    throw new Error('pass --address <pubkey> or set CATNIP_PUBKEY to verify a devnet audit chain');
  }
  const connection = new Connection(config.rpcUrl, 'confirmed');
  process.stdout.write(`verifying CATNIP memos for ${address} on ${config.cluster}…\n`);
  const result = await verifyChain(connection, address, Number(flags.limit ?? 100));
  for (const entry of result.records) {
    const record = entry.record ?? {};
    process.stdout.write(
      `  ${pad(record.k ?? '?', 5)}${pad(record.s ?? '?', 11)}`
      + `$${String(record.u ?? '?').padEnd(9)}${explorerUrl(entry.signature)}\n`,
    );
  }
  process.stdout.write(
    `\n${result.count} anchored decisions, hash chain ${result.valid ? 'VALID' : `BROKEN at index ${result.broken}`}\n`,
  );
  if (!result.valid) process.exitCode = 1;
}

async function cmdDoctor(config) {
  process.stdout.write(BANNER);
  const checks = [];
  checks.push(['node', process.version, Number(process.versions.node.split('.')[0]) >= 20]);
  checks.push(['cluster', config.cluster, config.cluster !== 'mainnet-beta']);
  checks.push(['rpc url', config.rpcUrl, !/mainnet/i.test(config.rpcUrl)]);
  checks.push(['keypair env', process.env.CATNIP_KEYPAIR ? 'set' : 'not set (paper mode only)', true]);

  try {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const version = await connection.getVersion();
    checks.push(['rpc reachable', `solana-core ${version['solana-core']}`, true]);
  } catch (error) {
    checks.push(['rpc reachable', error.message, false]);
  }

  try {
    const source = createFixtureSource({});
    checks.push(['fixture tape', `${source.frameCount} frames`, source.frameCount > 0]);
  } catch (error) {
    checks.push(['fixture tape', error.message, false]);
  }

  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=cat%20solana', {
      headers: { accept: 'application/json' },
    });
    checks.push(['live market data', `HTTP ${response.status}`, response.ok]);
  } catch (error) {
    checks.push(['live market data', error.message, false]);
  }

  for (const [label, value, ok] of checks) {
    process.stdout.write(`${ok ? '  ok ' : '  !! '}${pad(label, 20)}${value}\n`);
  }
  if (checks.some(([, , ok]) => !ok)) process.exitCode = 1;
}

function cmdHelp() {
  process.stdout.write(`${BANNER}
usage: catnip <command> [flags]

  scan       classify the current market: cat? running? safe?
             --source fixture|live  --deep  --file <tape.json>  --frame N
  backtest   replay the deterministic tape and print PnL
             --file <tape.json>  --verbose  --log <file>
  run        run the agent loop
             --mode paper|devnet  --source fixture|live
             --ticks N  --speed <ms between ticks>  --log <file>
  anchor-selftest
             anchor one buy + one sell on devnet and read them back
             (needs CATNIP_KEYPAIR and free devnet SOL)
  verify     re-read the devnet audit chain for a wallet
             --address <pubkey>  --limit N
  doctor     check node, config, RPC and data sources

environment: see .env.example (every CATNIP_* key is optional except
CATNIP_KEYPAIR, which is required only for --mode devnet)
`);
}

// --- entry -----------------------------------------------------------------

async function main() {
  loadDotEnv();
  const { command, flags } = parseArgs(process.argv.slice(2));
  const overrides = {};
  if (flags.cash) overrides.startingCashUsd = Number(flags.cash);
  const config = loadConfig(overrides);

  switch (command) {
    case 'scan': return cmdScan(config, flags);
    case 'backtest': return cmdBacktest(config, flags);
    case 'run': return cmdRun(config, flags);
    case 'anchor-selftest': return cmdAnchorSelftest(config);
    case 'verify': return cmdVerify(config, flags);
    case 'doctor': return cmdDoctor(config);
    default: return cmdHelp();
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain || process.argv[1]?.includes('index.js')) {
  main().catch((error) => {
    process.stderr.write(`\nerror: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export { parseArgs, buildSource };
