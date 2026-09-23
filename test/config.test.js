import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, envKey, DEFAULTS } from '../src/config.js';

test('defaults load and are frozen', () => {
  const config = loadConfig({}, {});
  assert.equal(config.cluster, 'devnet');
  assert.equal(config.startingCashUsd, DEFAULTS.startingCashUsd);
  assert.throws(() => { config.startingCashUsd = 1; }, TypeError);
});

test('env keys are derived predictably', () => {
  assert.equal(envKey('startingCashUsd'), 'CATNIP_STARTING_CASH_USD');
  assert.equal(envKey('rpcUrl'), 'CATNIP_RPC_URL');
});

test('numeric env values override defaults', () => {
  const config = loadConfig({}, { CATNIP_STARTING_CASH_USD: '2500', CATNIP_MAX_OPEN_POSITIONS: '3' });
  assert.equal(config.startingCashUsd, 2500);
  assert.equal(config.maxOpenPositions, 3);
});

test('a non-numeric env value is a hard error, not a silent default', () => {
  assert.throws(
    () => loadConfig({}, { CATNIP_STARTING_CASH_USD: 'lots' }),
    /is not a number/,
  );
});

test('the blocklist parses from a comma list', () => {
  const config = loadConfig({}, { CATNIP_BLOCKLIST: 'Mint1, Mint2 ,' });
  assert.deepEqual(config.blocklist, ['Mint1', 'Mint2']);
});

test('mainnet is refused, by cluster name and by RPC URL', () => {
  assert.throws(() => loadConfig({}, { CATNIP_CLUSTER: 'mainnet-beta' }), /mainnet is refused/);
  assert.throws(
    () => loadConfig({}, { CATNIP_RPC_URL: 'https://api.mainnet-beta.solana.com' }),
    /mainnet is refused/,
  );
});

test('a devnet RPC override is accepted', () => {
  const config = loadConfig({}, { CATNIP_RPC_URL: 'https://my-devnet.example.com' });
  assert.equal(config.rpcUrl, 'https://my-devnet.example.com');
});

test('nonsensical risk settings are rejected', () => {
  assert.throws(() => loadConfig({ startingCashUsd: 0 }), /startingCashUsd/);
  assert.throws(() => loadConfig({ basePositionPct: 0 }), /basePositionPct/);
  assert.throws(() => loadConfig({ basePositionPct: 150 }), /basePositionPct/);
  assert.throws(() => loadConfig({ maxOpenPositions: 0 }), /maxOpenPositions/);
  assert.throws(() => loadConfig({ stopLossPct: -1 }), /stopLossPct/);
  assert.throws(() => loadConfig({ maxPoolSharePct: 0 }), /maxPoolSharePct/);
  assert.throws(() => loadConfig({ blocklist: 'nope' }), /blocklist/);
});

test('several problems are reported together', () => {
  try {
    loadConfig({ startingCashUsd: -1, maxOpenPositions: 0 });
    assert.fail('should have thrown');
  } catch (error) {
    assert.match(error.message, /startingCashUsd/);
    assert.match(error.message, /maxOpenPositions/);
  }
});
