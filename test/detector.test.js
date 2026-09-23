import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catScore, normalise, tokenise, countCatEmoji, matchCatTerms, matchAntiTerms, selectCats,
} from '../src/cat/detector.js';

test('normalise folds leetspeak and strips punctuation', () => {
  assert.equal(normalise('P0PC4T!!'), 'popcat');
  assert.equal(normalise('$C@T-C0IN'), 'scat coin');
  assert.equal(normalise('  Meow   Finance  '), 'meow finance');
});

test('tokenise splits into words', () => {
  assert.deepEqual(tokenise('Meow Finance 2'), ['meow', 'finance']);
  assert.deepEqual(tokenise(''), []);
  assert.deepEqual(tokenise(null), []);
});

test('countCatEmoji finds cat pictographs only', () => {
  assert.equal(countCatEmoji('\u{1F431} hello \u{1F638}'), 2);
  assert.equal(countCatEmoji('\u{1F436} dog'), 0);
  assert.equal(countCatEmoji(undefined), 0);
});

test('obvious cats score above threshold', () => {
  for (const token of [
    { symbol: 'CAT', name: 'Cat Coin' },
    { symbol: 'MEOWFI', name: 'Meow Finance' },
    { symbol: 'POPCAT', name: 'Popcat' },
    { symbol: 'NEKO', name: 'Neko Samurai' },
    { symbol: 'KUCING', name: 'Kucing Terbang' },
    { symbol: 'GATO', name: 'Gato Loco' },
    { symbol: 'SOLCAT', name: 'Solana Cat' },
    { symbol: 'MOONKITTY', name: 'Moon Kitty' },
    { symbol: 'BOBCAT', name: 'Bobcat' },
  ]) {
    const result = catScore(token);
    assert.ok(result.isCat, `${token.symbol} should be a cat, got ${result.score}`);
  }
});

test('leetspeak cats are still cats', () => {
  assert.ok(catScore({ symbol: 'P0PC4T', name: 'P0pC4t L33t' }).isCat);
  assert.ok(catScore({ symbol: 'K1TTY', name: 'K1tty' }).isCat);
});

test('emoji-only tickers are detected', () => {
  const result = catScore({ symbol: '\u{1F431}COIN', name: '\u{1F408} Emoji Only' });
  assert.ok(result.isCat);
  assert.ok(result.hits.some((hit) => hit.kind === 'emoji'));
});

test('container traps are NOT cats', () => {
  for (const token of [
    { symbol: 'CATALYST', name: 'Catalyst Protocol' },
    { symbol: 'CONCAT', name: 'Concatenate DAO' },
    { symbol: 'CATEGORY', name: 'Category Labs' },
    { symbol: 'DUPLICATE', name: 'Duplicate' },
    { symbol: 'VOCATION', name: 'Vocation' },
    { symbol: 'SCATTER', name: 'Scatter Protocol' },
    { symbol: 'CHATGPT', name: 'Chatgpt Token' },
    { symbol: 'KATANA', name: 'Katana' },
    { symbol: 'GATEWAY', name: 'Gateway' },
  ]) {
    const result = catScore(token);
    assert.equal(result.isCat, false, `${token.symbol} must not be a cat, got ${result.score}`);
  }
});

test('a stray letter in front does not make a cat (SCATE regression)', () => {
  // Found against live DexScreener data: "SCATE" was scoring 0.69 before the
  // prefix rule was tightened.
  assert.equal(catScore({ symbol: 'SCATE', name: 'Scate' }).isCat, false);
  assert.equal(catScore({ symbol: 'SCAT' }).isCat, false);
});

test('dog-dominant tokens lose their cat score', () => {
  const result = catScore({
    symbol: 'DOGWIFCAT', name: 'Dog Wif Cat Hat', description: 'shiba inu energy',
  });
  assert.equal(result.isCat, false);
  assert.ok(result.antiHits.length > 0);
});

test('a cat mentioned only in a dog description is penalised but survives', () => {
  const result = catScore({ symbol: 'MEOW', name: 'Meow', description: 'we beat every dog coin' });
  assert.ok(result.isCat, 'symbol is unambiguous, a description jab should not kill it');
  assert.ok(result.antiHits.length > 0);
});

test('non-cats score zero', () => {
  assert.equal(catScore({ symbol: 'BONK', name: 'Bonk' }).score, 0);
  assert.equal(catScore({ symbol: 'SOL', name: 'Solana' }).score, 0);
  assert.equal(catScore({}).score, 0);
});

test('matchCatTerms / matchAntiTerms expose evidence', () => {
  assert.deepEqual(matchCatTerms('meow').map((h) => h.term), ['meow']);
  assert.deepEqual(matchCatTerms('catalyst'), []);
  assert.deepEqual(matchAntiTerms('shiba inu').map((h) => h.term), ['shiba', 'inu']);
});

test('every result carries a human-readable reason', () => {
  assert.match(catScore({ symbol: 'MEOW' }).reason, /cat signal/);
  assert.equal(catScore({ symbol: 'SOL' }).reason, 'no cat signal');
});

test('selectCats filters and sorts most-cat first', () => {
  const selected = selectCats([
    { symbol: 'SOL', name: 'Solana' },
    { symbol: 'MEOW', name: 'Meow \u{1F431}' },
    { symbol: 'CATALYST', name: 'Catalyst' },
    { symbol: 'GATO', name: 'Gato' },
  ]);
  assert.equal(selected.length, 2);
  assert.ok(selected[0].cat.score >= selected[1].cat.score);
  assert.ok(selected.every((token) => token.cat.isCat));
});

test('scores stay within [0,1]', () => {
  const loud = catScore({
    symbol: 'CATCATCAT',
    name: 'cat kitty meow neko gato \u{1F431}\u{1F408}\u{1F638}',
    description: 'cat cat cat kitty kitty meow meow',
  });
  assert.ok(loud.score <= 1 && loud.score >= 0);
});
