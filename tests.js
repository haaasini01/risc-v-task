/**
 * tests.js — Unit tests for RISC-V Instruction Set Explorer
 *
 * No external test framework required — uses Node's built-in assert module.
 */

'use strict';

const assert = require('assert');
const path   = require('path');

const { groupByExtension, findSharedInstructions } = require('./src/parser');
const { normalise, extractJsonExtensions, crossReference } = require('./src/crossref');
// const { buildGraph } = require('./src/graph');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✘  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_DICT = {
  add:    { extension: ['rv_i'],              encoding: '...', variable_fields: [] },
  mul:    { extension: ['rv_m'],              encoding: '...', variable_fields: [] },
  sh1add: { extension: ['rv_zba', 'rv32_zba'],encoding: '...', variable_fields: [] },
  aes32:  { extension: ['rv32_zknd', 'rv32_zk', 'rv32_zkn'],
                                              encoding: '...', variable_fields: [] },
  fmv:    { extension: ['rv_f'],              encoding: '...', variable_fields: [] },
  noext:  {                                   encoding: '...', variable_fields: [] },  // no extension key
};

// ── Parser tests ──────────────────────────────────────────────────────────────

console.log('\n── Parser Tests ─────────────────────────────────────────────────────');

test('groupByExtension: basic grouping', () => {
  const groups = groupByExtension(SAMPLE_DICT);
  assert.ok(groups.has('rv_i'), 'rv_i should be a key');
  assert.ok(groups.has('rv_m'), 'rv_m should be a key');
  assert.deepStrictEqual(groups.get('rv_i'), ['ADD']);
  assert.deepStrictEqual(groups.get('rv_m'), ['MUL']);
});

test('groupByExtension: instruction with 2 extensions appears in both groups', () => {
  const groups = groupByExtension(SAMPLE_DICT);
  assert.ok(groups.get('rv_zba').includes('SH1ADD'), 'SH1ADD in rv_zba');
  assert.ok(groups.get('rv32_zba').includes('SH1ADD'), 'SH1ADD in rv32_zba');
});

test('groupByExtension: instruction with 3 extensions appears in all 3 groups', () => {
  const groups = groupByExtension(SAMPLE_DICT);
  assert.ok(groups.get('rv32_zknd').includes('AES32'), 'AES32 in rv32_zknd');
  assert.ok(groups.get('rv32_zk').includes('AES32'),   'AES32 in rv32_zk');
  assert.ok(groups.get('rv32_zkn').includes('AES32'),  'AES32 in rv32_zkn');
});

test('groupByExtension: instruction with missing extension key is safely ignored', () => {
  const groups = groupByExtension(SAMPLE_DICT);
  // "noext" has no extension key; should not throw and not appear anywhere
  for (const mnemonics of groups.values()) {
    assert.ok(!mnemonics.includes('NOEXT'), '"noext" should not appear in any group');
  }
});

test('groupByExtension: result is sorted by extension name', () => {
  const groups = groupByExtension(SAMPLE_DICT);
  const keys = [...groups.keys()];
  const sorted = [...keys].sort();
  assert.deepStrictEqual(keys, sorted, 'Keys should be alphabetically sorted');
});

test('findSharedInstructions: finds multi-extension instructions', () => {
  const shared = findSharedInstructions(SAMPLE_DICT);
  const mnemonics = shared.map(s => s.mnemonic);
  assert.ok(mnemonics.includes('SH1ADD'), 'SH1ADD should be in shared list');
  assert.ok(mnemonics.includes('AES32'),  'AES32 should be in shared list');
});

test('findSharedInstructions: single-extension instructions not included', () => {
  const shared = findSharedInstructions(SAMPLE_DICT);
  const mnemonics = shared.map(s => s.mnemonic);
  assert.ok(!mnemonics.includes('ADD'), 'ADD should NOT be in shared list');
  assert.ok(!mnemonics.includes('MUL'), 'MUL should NOT be in shared list');
});

test('findSharedInstructions: result is sorted by mnemonic', () => {
  const shared = findSharedInstructions(SAMPLE_DICT);
  const mnemonics = shared.map(s => s.mnemonic);
  const sorted = [...mnemonics].sort();
  assert.deepStrictEqual(mnemonics, sorted, 'Shared instructions should be alphabetically sorted');
});

test('findSharedInstructions: extension list is preserved', () => {
  const shared = findSharedInstructions(SAMPLE_DICT);
  const aes32 = shared.find(s => s.mnemonic === 'AES32');
  assert.ok(aes32, 'AES32 entry should exist');
  assert.deepStrictEqual(aes32.extensions, ['rv32_zknd', 'rv32_zk', 'rv32_zkn']);
});

// ── Normalisation tests ───────────────────────────────────────────────────────

console.log('\n── Normalisation Tests ──────────────────────────────────────────────');

test('normalise: strips rv_ prefix', () => {
  assert.strictEqual(normalise('rv_i'),   'i');
  assert.strictEqual(normalise('rv_zba'), 'zba');
});

test('normalise: strips rv32_ prefix', () => {
  assert.strictEqual(normalise('rv32_zknd'), 'zknd');
  assert.strictEqual(normalise('rv32_zk'),   'zk');
});

test('normalise: strips rv64_ prefix', () => {
  assert.strictEqual(normalise('rv64_zba'), 'zba');
  assert.strictEqual(normalise('rv64_i'),   'i');
});

test('normalise: lowercases manual-style tokens', () => {
  assert.strictEqual(normalise('Zba'),   'zba');
  assert.strictEqual(normalise('Zicsr'), 'zicsr');
  assert.strictEqual(normalise('M'),     'm');
  assert.strictEqual(normalise('F'),     'f');
});

test('normalise: rv32 and rv64 variants map to same key as plain', () => {
  assert.strictEqual(normalise('rv_zba'),   normalise('rv32_zba'));
  assert.strictEqual(normalise('rv32_zba'), normalise('rv64_zba'));
  assert.strictEqual(normalise('Zba'),      normalise('rv_zba'));
});

// ── Cross-reference tests ─────────────────────────────────────────────────────

console.log('\n── Cross-Reference Tests ────────────────────────────────────────────');

test('extractJsonExtensions: correct normalised keys', () => {
  const exts = extractJsonExtensions(SAMPLE_DICT);
  assert.ok(exts.has('i'),    'should have normalised key "i"');
  assert.ok(exts.has('m'),    'should have normalised key "m"');
  assert.ok(exts.has('zba'),  'should have normalised key "zba"');
  assert.ok(exts.has('zknd'), 'should have normalised key "zknd"');
});

test('crossReference: matched when normalised keys coincide', () => {
  const jsonExts   = new Map([['zba', 'rv_zba'], ['i', 'rv_i'], ['m', 'rv_m']]);
  const manualExts = new Map([['zba', 'Zba'],    ['i', 'I'],    ['f', 'F']]);
  const { matched, jsonOnly, manualOnly } = crossReference(jsonExts, manualExts);

  assert.strictEqual(matched.length,    2, '2 should be matched (zba, i)');
  assert.strictEqual(jsonOnly.length,   1, '1 in JSON only (m)');
  assert.strictEqual(manualOnly.length, 1, '1 in manual only (f)');
});

test('crossReference: jsonOnly contains correct entry', () => {
  const jsonExts   = new Map([['m', 'rv_m']]);
  const manualExts = new Map([['f', 'F']]);
  const { jsonOnly } = crossReference(jsonExts, manualExts);
  assert.strictEqual(jsonOnly[0].key,  'm');
  assert.strictEqual(jsonOnly[0].orig, 'rv_m');
});

test('crossReference: manualOnly contains correct entry', () => {
  const jsonExts   = new Map([['m', 'rv_m']]);
  const manualExts = new Map([['f', 'F']]);
  const { manualOnly } = crossReference(jsonExts, manualExts);
  assert.strictEqual(manualOnly[0].key,  'f');
  assert.strictEqual(manualOnly[0].orig, 'F');
});

test('crossReference: empty inputs produce empty results', () => {
  const { matched, jsonOnly, manualOnly } = crossReference(new Map(), new Map());
  assert.strictEqual(matched.length,    0);
  assert.strictEqual(jsonOnly.length,   0);
  assert.strictEqual(manualOnly.length, 0);
});

test('crossReference: result arrays are sorted by key', () => {
  const json   = new Map([['zba', 'rv_zba'], ['i', 'rv_i'], ['m', 'rv_m']]);
  const manual = new Map([['zba', 'Zba'],    ['i', 'I']]);
  const { matched } = crossReference(json, manual);
  const keys = matched.map(m => m.key);
  assert.deepStrictEqual(keys, [...keys].sort());
});

// // ── Graph tests ───────────────────────────────────────────────────────────────

// console.log('\n── Graph Tests ──────────────────────────────────────────────────────');

// test('buildGraph: nodes created for multi-extension instructions', () => {
//   const { adjacency } = buildGraph(SAMPLE_DICT);
//   assert.ok(adjacency.has('rv_zba'),   'rv_zba should be a node');
//   assert.ok(adjacency.has('rv32_zba'), 'rv32_zba should be a node');
//   assert.ok(adjacency.has('rv32_zknd'),'rv32_zknd should be a node');
// });

// test('buildGraph: single-extension instructions do not add nodes', () => {
//   const { adjacency } = buildGraph(SAMPLE_DICT);
//   // ADD is only in rv_i, so rv_i should not appear
//   assert.ok(!adjacency.has('rv_i'), 'rv_i should not be a node (only single-ext instrs)');
//   assert.ok(!adjacency.has('rv_f'), 'rv_f should not be a node');
// });

// test('buildGraph: edges are bidirectional', () => {
//   const { adjacency } = buildGraph(SAMPLE_DICT);
//   assert.ok(adjacency.get('rv_zba')?.has('rv32_zba'), 'rv_zba -> rv32_zba edge');
//   assert.ok(adjacency.get('rv32_zba')?.has('rv_zba'), 'rv32_zba -> rv_zba edge (reverse)');
// });

// test('buildGraph: sharedDetails edge key is sorted', () => {
//   const { sharedDetails } = buildGraph(SAMPLE_DICT);
//   for (const key of sharedDetails.keys()) {
//     const [a, b] = key.split('||');
//     assert.ok(a <= b, `Edge key "${key}" must be in sorted order`);
//   }
// });

// test('buildGraph: correct mnemonic recorded for edge', () => {
//   const { sharedDetails } = buildGraph(SAMPLE_DICT);
//   const edgeKey = ['rv_zba', 'rv32_zba'].sort().join('||');
//   const mnemonics = sharedDetails.get(edgeKey);
//   assert.ok(Array.isArray(mnemonics),         'mnemonics should be an array');
//   assert.ok(mnemonics.includes('SH1ADD'),     'SH1ADD should be on the rv_zba/rv32_zba edge');
// });

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(50));
console.log(`  Results: ${passed} passed,  ${failed} failed`);
console.log('═'.repeat(50) + '\n');

if (failed > 0) process.exit(1);
