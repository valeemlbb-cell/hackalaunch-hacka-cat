#!/usr/bin/env node
/**
 * Deterministic tape generator for fixtures/tape.json.
 *
 * The tape is synthetic but shaped like a real cat-coin session: two clean
 * runners, one pump-and-dump, one slow bleeder, plus the decoys the detector
 * has to reject (CATALYST, Concatenate, DOGWIFCAT) and the tokens the risk
 * guards have to reject (live mint authority, thin liquidity).
 *
 * Deterministic by design: same seed -> byte-identical tape, so the tests, the
 * backtest number in the README and the demo video all agree.
 *
 * Usage: node tools/make-tape.js [--frames 48] [--seed 7]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../fixtures/tape.json');

const FRAME_SECONDS = 300; // 5 minutes per frame
const START_AT = Date.UTC(2026, 8, 24, 0, 0, 0);

/** Mulberry32 — small, fast, fully deterministic. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shapes: multiplier applied to the base price at frame f of n. */
const SHAPES = {
  runner: (f, n) => 1 + 2.4 * Math.min(1, (f / n) * 2.2) ** 1.6,
  pumpdump: (f, n) => {
    const peak = n * 0.42;
    return f <= peak ? 1 + 3.1 * (f / peak) ** 1.4 : 4.1 - 3.0 * ((f - peak) / (n - peak)) ** 0.8;
  },
  late: (f, n) => (f < n * 0.55 ? 1 + 0.05 * (f / n) : 1 + 1.9 * ((f - n * 0.55) / (n * 0.45)) ** 1.3),
  bleed: (f, n) => 1 - 0.55 * (f / n),
  flat: () => 1,
  chop: (f) => 1 + 0.08 * Math.sin(f / 2.3),
};

const TOKENS = [
  {
    mint: 'CatN1pRunner1111111111111111111111111111111', symbol: 'MEOWFI',
    name: 'Meow Finance \u{1F431}', description: 'the purr-fect defi cat on solana',
    basePrice: 0.000042, baseLiquidity: 78000, baseVolume24h: 640000,
    shape: 'runner', ageMinutes: 190, holders: 2400, topHolderPct: 6.2, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pRunner2222222222222222222222222222222', symbol: 'POPCAT',
    name: 'Popcat', description: 'pop the cat',
    basePrice: 0.83, baseLiquidity: 410000, baseVolume24h: 2900000,
    shape: 'chop', ageMinutes: 90000, holders: 51000, topHolderPct: 3.1, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pPumpDump33333333333333333333333333333', symbol: 'NEKO',
    name: 'Neko Samurai', description: 'neko-chan slices the chart',
    basePrice: 0.0011, baseLiquidity: 52000, baseVolume24h: 310000,
    shape: 'pumpdump', ageMinutes: 45, holders: 980, topHolderPct: 11.4, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pLateRun444444444444444444444444444444', symbol: 'GATO',
    name: 'Gato Loco', description: 'el gato mas loco de solana',
    basePrice: 0.000009, baseLiquidity: 31000, baseVolume24h: 145000,
    shape: 'late', ageMinutes: 620, holders: 640, topHolderPct: 9.0, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pLeetCat555555555555555555555555555555', symbol: 'P0PC4T',
    name: 'P0pC4t L33t', description: 'the leetspeak c4t your regex misses',
    basePrice: 0.00021, baseLiquidity: 44000, baseVolume24h: 205000,
    shape: 'runner', ageMinutes: 300, holders: 710, topHolderPct: 8.3, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pEmojiCat66666666666666666666666666666', symbol: '\u{1F431}COIN',
    name: '\u{1F408} Emoji Only', description: 'no latin letters, still a cat \u{1F63A}',
    basePrice: 0.0000031, baseLiquidity: 27000, baseVolume24h: 96000,
    shape: 'runner', ageMinutes: 260, holders: 420, topHolderPct: 12.5, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pBleeder777777777777777777777777777777', symbol: 'FLOPPA',
    name: 'Floppa Caracal', description: 'big floppa',
    basePrice: 0.00007, baseLiquidity: 39000, baseVolume24h: 88000,
    shape: 'bleed', ageMinutes: 5000, holders: 1500, topHolderPct: 7.7, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pThinLiq888888888888888888888888888888', symbol: 'KUCING',
    name: 'Kucing Terbang', description: 'kucing terbang ke bulan',
    basePrice: 0.0000004, baseLiquidity: 2200, baseVolume24h: 9000,
    shape: 'runner', ageMinutes: 30, holders: 90, topHolderPct: 18.0, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pHoneypot99999999999999999999999999999', symbol: 'KITTYX',
    name: 'Kitty Rug', description: 'kitty to the moon 100x guaranteed',
    basePrice: 0.00005, baseLiquidity: 61000, baseVolume24h: 420000,
    shape: 'pumpdump', ageMinutes: 22, holders: 300, topHolderPct: 44.0, lpBurnedPct: 0,
    mintAuthority: 'RugP0werAuth1111111111111111111111111111111',
    freezeAuthority: 'RugP0werAuth1111111111111111111111111111111',
  },
  {
    mint: 'TrapCatalyst111111111111111111111111111111', symbol: 'CATALYST',
    name: 'Catalyst Protocol', description: 'a catalyst for the category of cattle markets',
    basePrice: 1.24, baseLiquidity: 190000, baseVolume24h: 880000,
    shape: 'runner', ageMinutes: 40000, holders: 9000, topHolderPct: 5.0, lpBurnedPct: 100,
  },
  {
    mint: 'TrapConcat2222222222222222222222222222222', symbol: 'CONCAT',
    name: 'Concatenate DAO', description: 'we concatenate your duplicate certificates',
    basePrice: 0.041, baseLiquidity: 88000, baseVolume24h: 300000,
    shape: 'pumpdump', ageMinutes: 20000, holders: 3100, topHolderPct: 6.0, lpBurnedPct: 100,
  },
  {
    mint: 'TrapDogWifCat3333333333333333333333333333', symbol: 'DOGWIFCAT',
    name: 'Dog Wif Cat Hat', description: 'a dog wearing a cat hat, shiba inu energy',
    basePrice: 0.0003, baseLiquidity: 120000, baseVolume24h: 700000,
    shape: 'runner', ageMinutes: 700, holders: 4000, topHolderPct: 5.5, lpBurnedPct: 100,
  },
  {
    mint: 'TrapBonkAi44444444444444444444444444444444', symbol: 'BONKAI',
    name: 'Bonk AI Agent', description: 'the dog that trades',
    basePrice: 0.000018, baseLiquidity: 250000, baseVolume24h: 1500000,
    shape: 'runner', ageMinutes: 12000, holders: 22000, topHolderPct: 4.0, lpBurnedPct: 100,
  },
  {
    mint: 'CatN1pIndex5555555555555555555555555555555', symbol: 'CATNIP',
    name: 'Catnip Index', description: 'basket of the top feline runners \u{1F43E}',
    basePrice: 0.0016, baseLiquidity: 66000, baseVolume24h: 240000,
    shape: 'late', ageMinutes: 1400, holders: 1800, topHolderPct: 6.8, lpBurnedPct: 100,
  },
];

function build(frames, seed) {
  const random = rng(seed);
  const tape = [];
  const priceHistory = new Map(TOKENS.map((token) => [token.mint, []]));

  for (let frame = 0; frame < frames; frame += 1) {
    const rows = [];
    const now = START_AT + frame * FRAME_SECONDS * 1000;

    for (const token of TOKENS) {
      const shape = SHAPES[token.shape];
      const noise = 1 + (random() - 0.5) * 0.045;
      const price = token.basePrice * shape(frame, frames) * noise;
      const history = priceHistory.get(token.mint);
      history.push(price);

      const prev = history[history.length - 2] ?? price;
      const hourAgo = history[Math.max(0, history.length - 13)] ?? price;
      const dayAgo = history[0];
      const change5m = ((price - prev) / prev) * 100;
      const change1h = ((price - hourAgo) / hourAgo) * 100;
      const change24h = ((price - dayAgo) / dayAgo) * 100;

      // Volume follows |momentum| with a floor, so a runner really does show
      // volume acceleration rather than just a green candle.
      const heat = 1 + Math.abs(change5m) / 4 + Math.max(0, change1h) / 30;
      const volume5m = (token.baseVolume24h / 288) * heat * (0.75 + random() * 0.5);
      const volume24h = token.baseVolume24h * (0.8 + Math.max(0, change24h) / 250);

      rows.push({
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        description: token.description,
        priceUsd: price,
        liquidityUsd: token.baseLiquidity * (1 + Math.max(0, change1h) / 180),
        volume24hUsd: volume24h,
        volume5mUsd: volume5m,
        priceChange5m: change5m,
        priceChange1h: change1h,
        priceChange24h: change24h,
        holders: Math.round(token.holders * (1 + Math.max(0, change1h) / 200)),
        holdersDelta1h: Math.round((token.holders * Math.max(0, change1h)) / 200),
        createdAt: now - token.ageMinutes * 60000,
        mintAuthority: token.mintAuthority ?? null,
        freezeAuthority: token.freezeAuthority ?? null,
        topHolderPct: token.topHolderPct,
        lpBurnedPct: token.lpBurnedPct,
      });
    }
    tape.push(rows);
  }

  return {
    generator: 'tools/make-tape.js',
    note: 'Synthetic but deterministic cat-coin session. Regenerate with `npm run tape`.',
    seed,
    frameCount: frames,
    frameSeconds: FRAME_SECONDS,
    startAt: START_AT,
    tokens: TOKENS.map((t) => ({ mint: t.mint, symbol: t.symbol, shape: t.shape })),
    frames: tape,
  };
}

const args = process.argv.slice(2);
const readArg = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : Number(args[index + 1]);
};

const tape = build(readArg('--frames', 48), readArg('--seed', 7));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(tape));
process.stdout.write(`wrote ${OUT} (${tape.frames.length} frames x ${TOKENS.length} tokens)\n`);
