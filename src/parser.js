/**
 * parser.js
 * Tier 1: Parse instr_dict.json and group instructions by extension.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load and parse the instruction dictionary JSON file.
 * @param {string} filePath - Path to instr_dict.json
 * @returns {Object} Raw parsed JSON object
 */
function loadInstrDict(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Group instructions by their extension tags.
 * @param {Object} instrDict - Raw instruction dictionary
 * @returns {Map<string, string[]>} Map of extension -> list of instruction mnemonics
 */
function groupByExtension(instrDict) {
  const groups = new Map();

  for (const [mnemonic, info] of Object.entries(instrDict)) {
    const extensions = info.extension || [];
    for (const ext of extensions) {
      if (!groups.has(ext)) {
        groups.set(ext, []);
      }
      groups.get(ext).push(mnemonic.toUpperCase());
    }
  }

  // Sort entries alphabetically by extension name
  return new Map([...groups.entries()].sort());
}

/**
 * Find instructions that belong to more than one extension.
 * @param {Object} instrDict - Raw instruction dictionary
 * @returns {Array<{mnemonic, extensions}>} List of shared instructions
 */
function findSharedInstructions(instrDict) {
  const shared = [];
  for (const [mnemonic, info] of Object.entries(instrDict)) {
    const extensions = info.extension || [];
    if (extensions.length > 1) {
      shared.push({ mnemonic: mnemonic.toUpperCase(), extensions });
    }
  }
  return shared.sort((a, b) => a.mnemonic.localeCompare(b.mnemonic));
}

/**
 * Print a formatted summary table to stdout.
 * @param {Map<string, string[]>} groups - Extension -> mnemonics map
 */
function printSummaryTable(groups) {
  console.log('\n' + '═'.repeat(60));
  console.log('  RISC-V Extension Summary Table');
  console.log('═'.repeat(60));
  console.log(
    padRight('Extension', 22) +
    padRight('Count', 8) +
    'Example Mnemonic'
  );
  console.log('─'.repeat(60));

  for (const [ext, mnemonics] of groups) {
    const example = mnemonics[0]; // first is fine; sorted alphabetically within group
    console.log(
      padRight(ext, 22) +
      padRight(String(mnemonics.length), 8) +
      example
    );
  }

  console.log('─'.repeat(60));
  console.log(`Total extensions: ${groups.size}`);
  const totalInstrs = [...groups.values()].reduce((s, v) => s + v.length, 0);
  console.log(`Total instruction-extension pairs: ${totalInstrs}`);
  console.log('═'.repeat(60) + '\n');
}

/**
 * Print instructions shared across multiple extensions.
 * @param {Array} shared
 */
function printSharedInstructions(shared) {
  console.log('═'.repeat(60));
  console.log('  Instructions Belonging to Multiple Extensions');
  console.log('═'.repeat(60));

  if (shared.length === 0) {
    console.log('  (none found)');
  } else {
    for (const { mnemonic, extensions } of shared) {
      console.log(`  ${mnemonic}`);
      console.log(`    -> ${extensions.join(', ')}`);
    }
  }

  console.log('─'.repeat(60));
  console.log(`Total shared instructions: ${shared.length}`);
  console.log('═'.repeat(60) + '\n');
}

// ── helpers ──────────────────────────────────────────────────────────────────

function padRight(str, len) {
  return str.length >= len ? str.slice(0, len - 1) + ' ' : str + ' '.repeat(len - str.length);
}

module.exports = {
  loadInstrDict,
  groupByExtension,
  findSharedInstructions,
  printSummaryTable,
  printSharedInstructions,
  padRight,
};
