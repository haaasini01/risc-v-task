/**
 * crossref.js
 * Tier 2: Cross-reference extensions from instr_dict.json against the
 * RISC-V ISA manual AsciiDoc sources.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalise an extension name to a canonical lower-case key.
 *
 * JSON side examples :  rv_i  rv64_zba  rv32_zkn  rv_m  rv_f
 * Manual side examples: Zba  Zicsr  M  F  Zba  RV32I  rv64i
 *
 * Strategy:
 *  1. Strip leading "rv_", "rv32_", "rv64_" prefixes (case-insensitive).
 *  2. Lower-case everything.
 *  3. Trim surrounding whitespace.
 */
function normalise(name) {
  return name
    .toLowerCase()
    .replace(/^rv(32|64)?_/, '')   // remove rv_, rv32_, rv64_
    .replace(/^rv(32|64)?/,  '')   // remove bare rv32 / rv64 prefix (no underscore)
    .trim();
}

// ── Extension extraction from JSON ────────────────────────────────────────────

/**
 * Return the set of normalised extension keys found in the instruction dict.
 * @param {Object} instrDict
 * @returns {Map<string, string>}  normalised -> original label
 */
function extractJsonExtensions(instrDict) {
  const map = new Map(); // normalised -> first-seen original
  for (const info of Object.values(instrDict)) {
    for (const ext of (info.extension || [])) {
      const key = normalise(ext);
      if (!map.has(key)) map.set(key, ext);
    }
  }
  return map;
}

// ── Extension extraction from AsciiDoc files ──────────────────────────────────

/**
 * Patterns that look like extension names inside AsciiDoc text.
 * We look for:
 *  - Zxxx  / Zxxxx  (Z-extensions, capital Z)
 *  - RV32I / RV64GC / RVWMO etc.
 *  - Single capital letters that are known base ISA letters (I M A F D Q C)
 * We intentionally keep the regex broad and deduplicate later.
 */
const EXTENSION_PATTERN = /\b(Z[a-z][a-zA-Z0-9]{1,14}|RV(?:32|64)?[A-Z][A-Za-z0-9]*|[IMAFDQC])\b/g;

/**
 * Recursively collect all *.adoc files under a directory.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectAdocFiles(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch (_) { return; }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.adoc')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

/**
 * Scan all AsciiDoc files and collect every extension-like token found.
 * @param {string} manualSrcDir  Path to the `src/` directory of riscv-isa-manual
 * @returns {Map<string, string>} normalised -> first-seen raw token
 */
function extractManualExtensions(manualSrcDir) {
  const map = new Map();
  const files = collectAdocFiles(manualSrcDir);

  if (files.length === 0) {
    throw new Error(`No .adoc files found under: ${manualSrcDir}`);
  }

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, 'utf8');
    let match;
    // Reset lastIndex for global regex on each file
    EXTENSION_PATTERN.lastIndex = 0;
    while ((match = EXTENSION_PATTERN.exec(text)) !== null) {
      const raw = match[1];
      const key = normalise(raw);
      if (!map.has(key)) map.set(key, raw);
    }
  }

  return map;
}

// ── Cross-reference logic ─────────────────────────────────────────────────────

/**
 * Compare JSON extensions vs manual extensions and produce a report.
 * @param {Map<string, string>} jsonExts   normalised -> original
 * @param {Map<string, string>} manualExts normalised -> original
 * @returns {Object} report object
 */
function crossReference(jsonExts, manualExts) {
  const matched    = [];
  const jsonOnly   = [];
  const manualOnly = [];

  for (const [key, orig] of jsonExts) {
    if (manualExts.has(key)) {
      matched.push({ key, jsonOrig: orig, manualOrig: manualExts.get(key) });
    } else {
      jsonOnly.push({ key, orig });
    }
  }

  for (const [key, orig] of manualExts) {
    if (!jsonExts.has(key)) {
      manualOnly.push({ key, orig });
    }
  }

  // Sort for stable output
  matched.sort((a, b) => a.key.localeCompare(b.key));
  jsonOnly.sort((a, b) => a.key.localeCompare(b.key));
  manualOnly.sort((a, b) => a.key.localeCompare(b.key));

  return { matched, jsonOnly, manualOnly };
}

// ── Printing ──────────────────────────────────────────────────────────────────

function printCrossRefReport({ matched, jsonOnly, manualOnly }) {
  const { padRight } = require('./parser');

  console.log('\n' + '═'.repeat(70));
  console.log('  RISC-V Cross-Reference Report: JSON ↔ ISA Manual');
  console.log('═'.repeat(70));

  // -- MATCHED --
  console.log(`\nMatched Extensions (${matched.length})`);
  console.log('─'.repeat(70));
  console.log(
    padRight('Normalised Key', 18) +
    padRight('In JSON as', 22) +
    'In Manual as'
  );
  console.log('─'.repeat(70));
  for (const { key, jsonOrig, manualOrig } of matched) {
    console.log(
      padRight(key, 18) +
      padRight(jsonOrig, 22) +
      manualOrig
    );
  }

  // -- JSON ONLY --
  console.log(`\nIn JSON only — NOT found in ISA Manual (${jsonOnly.length})`);
  console.log('─'.repeat(70));
  if (jsonOnly.length === 0) {
    console.log('  (none)');
  } else {
    for (const { key, orig } of jsonOnly) {
      console.log(`  ${padRight(key, 18)} (as "${orig}")`);
    }
  }

  // -- MANUAL ONLY --
  console.log(`\nIn ISA Manual only — NOT found in JSON (${manualOnly.length})`);
  console.log('─'.repeat(70));
  if (manualOnly.length === 0) {
    console.log('  (none)');
  } else {
    for (const { key, orig } of manualOnly) {
      console.log(`  ${padRight(key, 18)} (as "${orig}")`);
    }
  }

  // -- SUMMARY --
  console.log('\n' + '─'.repeat(70));
  console.log(
    `  Summary: ${matched.length} matched,  ` +
    `${jsonOnly.length} in JSON only,  ` +
    `${manualOnly.length} in manual only`
  );
  console.log('═'.repeat(70) + '\n');
}

module.exports = {
  normalise,
  extractJsonExtensions,
  extractManualExtensions,
  crossReference,
  printCrossRefReport,
};
