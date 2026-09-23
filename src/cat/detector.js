/**
 * Cat detector.
 *
 * Answers one question about a token: is this a cat?
 *
 * The naive version of this ("does the name contain 'cat'") is wrong in both
 * directions. It tags CATALYST, Concat and Duplicate as cats, and it misses
 * NEKO, 🐱 COIN, P0PC4T and "kucing terbang". This module handles both sides:
 * word-boundary matching over a multilingual lexicon, leetspeak normalisation,
 * emoji, compound splitting, container traps, and dog/frog anti-signals.
 *
 * Output is a score in [0,1] plus the evidence, so every trade the agent makes
 * can be explained after the fact.
 */

import {
  CAT_TERMS, STRONG_TERMS, CAT_EMOJI, CONTAINER_TRAPS, ANTI_TERMS,
  LEET_MAP, COMPOUND_FILLERS,
} from './lexicon.js';

const CAT_TERM_SET = new Set(CAT_TERMS);
const EMOJI_SET = new Set(CAT_EMOJI);
const ANTI_TERM_SET = new Set(ANTI_TERMS);

const WEIGHT_SYMBOL = 0.55;
const WEIGHT_NAME = 0.35;
const WEIGHT_DESCRIPTION = 0.18;
const WEIGHT_EMOJI = 0.65;
const STRONG_BONUS = 0.25;
const ANTI_PENALTY_STRONG = 0.70;
const ANTI_PENALTY_WEAK = 0.25;
const MIN_COMPOUND_TERM_LENGTH = 3;

/** Default score above which a token is treated as a cat. */
export const CAT_THRESHOLD = 0.5;

/**
 * Normalise a string: lowercase, fold leetspeak/homoglyphs, keep letters and
 * spaces. Emoji are handled separately, so they are stripped here.
 */
export function normalise(raw) {
  if (typeof raw !== 'string') return '';
  const lowered = raw.toLowerCase().normalize('NFKD');
  let out = '';
  for (const char of lowered) {
    const mapped = LEET_MAP[char];
    if (mapped) { out += mapped; continue; }
    out += /[a-z]/.test(char) ? char : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Split normalised text into words. */
export function tokenise(raw) {
  const normalised = normalise(raw);
  return normalised ? normalised.split(' ') : [];
}

/** Count cat emoji occurrences in the original (un-normalised) text. */
export function countCatEmoji(raw) {
  if (typeof raw !== 'string') return 0;
  let count = 0;
  for (const char of raw) if (EMOJI_SET.has(char)) count += 1;
  return count;
}

/**
 * Try to split a glued ticker such as "catwifhat" or "moonkitty" into a cat
 * term plus known filler. Returns the cat term found, or null.
 */
function compoundCatTerm(word) {
  if (word.length <= MIN_COMPOUND_TERM_LENGTH) return null;
  for (const term of CAT_TERM_SET) {
    if (term.length < MIN_COMPOUND_TERM_LENGTH) continue;
    const index = word.indexOf(term);
    if (index === -1) continue;
    const before = word.slice(0, index);
    const after = word.slice(index + term.length);
    // The prefix must be empty or a recognised filler ("sol", "moon", "baby").
    // A stray letter in front is how "scate" and "vocat-ion" sneak in, so a
    // short unknown prefix is never accepted.
    const prefixOk = before === '' || COMPOUND_FILLERS.has(before);
    // A short unknown SUFFIX is fine: "catz", "kittyy", "meowz".
    const suffixOk = after === '' || COMPOUND_FILLERS.has(after) || after.length <= 2;
    if (prefixOk && suffixOk) return term;
  }
  return null;
}

/**
 * Find cat evidence in one field. Returns matched terms (may be empty).
 * A word inside CONTAINER_TRAPS never produces a hit.
 */
export function matchCatTerms(raw) {
  const hits = [];
  for (const word of tokenise(raw)) {
    if (CONTAINER_TRAPS.has(word)) continue;
    if (CAT_TERM_SET.has(word)) { hits.push({ term: word, kind: 'exact' }); continue; }
    const compound = compoundCatTerm(word);
    if (compound) hits.push({ term: compound, kind: 'compound', word });
  }
  return hits;
}

/** Find dog/frog/etc anti-signals in one field. */
export function matchAntiTerms(raw) {
  const hits = [];
  for (const word of tokenise(raw)) {
    if (ANTI_TERM_SET.has(word)) { hits.push({ term: word, kind: 'exact' }); continue; }
    for (const term of ANTI_TERM_SET) {
      if (term.length >= 4 && word.includes(term) && !CONTAINER_TRAPS.has(word)) {
        hits.push({ term, kind: 'compound', word });
        break;
      }
    }
  }
  return hits;
}

function fieldScore(raw, weight) {
  const hits = matchCatTerms(raw);
  if (hits.length === 0) return { score: 0, hits };
  const hasStrong = hits.some((hit) => STRONG_TERMS.has(hit.term));
  const base = weight * Math.min(1, 0.7 + 0.3 * hits.length);
  return { score: base + (hasStrong ? STRONG_BONUS * weight : 0), hits };
}

/**
 * Score how cat a token is.
 *
 * @param {{symbol?:string,name?:string,description?:string}} token
 * @returns {{score:number,isCat:boolean,hits:Array,antiHits:Array,reason:string}}
 */
export function catScore(token = {}) {
  const symbol = token.symbol ?? '';
  const name = token.name ?? '';
  const description = token.description ?? '';

  const symbolResult = fieldScore(symbol, WEIGHT_SYMBOL);
  const nameResult = fieldScore(name, WEIGHT_NAME);
  const descriptionResult = fieldScore(description, WEIGHT_DESCRIPTION);

  const emojiCount = countCatEmoji(`${symbol} ${name} ${description}`);
  const emojiScore = emojiCount > 0 ? WEIGHT_EMOJI * Math.min(1, 0.8 + 0.1 * emojiCount) : 0;

  let score = symbolResult.score + nameResult.score + descriptionResult.score + emojiScore;

  const antiSymbol = matchAntiTerms(symbol);
  const antiName = matchAntiTerms(name);
  const antiDescription = matchAntiTerms(description);
  const antiHits = [...antiSymbol, ...antiName, ...antiDescription];

  if (antiSymbol.length > 0 || antiName.length > 0) {
    score -= ANTI_PENALTY_STRONG;
  } else if (antiDescription.length > 0) {
    score -= ANTI_PENALTY_WEAK;
  }

  score = Math.max(0, Math.min(1, score));
  const hits = [...symbolResult.hits, ...nameResult.hits, ...descriptionResult.hits];
  if (emojiCount > 0) hits.push({ term: 'emoji', kind: 'emoji', count: emojiCount });

  return {
    score: Number(score.toFixed(4)),
    isCat: score >= CAT_THRESHOLD,
    hits,
    antiHits,
    reason: buildReason(hits, antiHits, score),
  };
}

function buildReason(hits, antiHits, score) {
  if (hits.length === 0) return 'no cat signal';
  const terms = [...new Set(hits.map((hit) => hit.term))].join(', ');
  const anti = antiHits.length > 0
    ? `; penalised by ${[...new Set(antiHits.map((hit) => hit.term))].join(', ')}`
    : '';
  return `cat signal: ${terms}${anti} -> ${score.toFixed(2)}`;
}

/** Filter a list of tokens down to the cats, sorted most-cat first. */
export function selectCats(tokens, threshold = CAT_THRESHOLD) {
  return tokens
    .map((token) => ({ ...token, cat: catScore(token) }))
    .filter((token) => token.cat.score >= threshold)
    .sort((a, b) => b.cat.score - a.cat.score);
}
