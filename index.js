#!/usr/bin/env node
/**
 * index.js — RISC-V Instruction Set Explorer
 *
 * Usage:
 *   node index.js [--json <path>] [--manual <path>] [--tier <1|2|3|all>]
 *
 * Defaults:
 *   --json    ./instr_dict.json
 *   --manual  ./riscv-isa-manual/src
 *   --tier    all
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const { loadInstrDict, groupByExtension, findSharedInstructions,
        printSummaryTable, printSharedInstructions } = require('./src/parser');

const { extractJsonExtensions, extractManualExtensions,
        crossReference, printCrossRefReport }         = require('./src/crossref');

const { buildGraph, printTextGraph, writeDotFile }    = require('./src/graph');

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    json:   './instr_dict.json',
    manual: './riscv-isa-manual/src',
    tier:   'all',
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json'   && argv[i + 1]) { args.json   = argv[++i]; }
    if (argv[i] === '--manual' && argv[i + 1]) { args.manual = argv[++i]; }
    if (argv[i] === '--tier'   && argv[i + 1]) { args.tier   = argv[++i]; }
  }
  return args;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  console.log('\n🔬  RISC-V Instruction Set Explorer');
  console.log(`    JSON  : ${args.json}`);
  console.log(`    Manual: ${args.manual}`);
  console.log(`    Tier  : ${args.tier}\n`);

  // ── TIER 1 ────────────────────────────────────────────────────────────────
  const runTier1 = args.tier === '1' || args.tier === 'all';
  const runTier2 = args.tier === '2' || args.tier === 'all';
  const runTier3 = args.tier === '3' || args.tier === 'all';

  let instrDict;
  let groups;

  if (runTier1 || runTier2 || runTier3) {
    console.log('── Tier 1: Parsing instr_dict.json ─────────────────────────────────');
    try {
      instrDict = loadInstrDict(args.json);
    } catch (err) {
      console.error(`ERROR loading JSON: ${err.message}`);
      process.exit(1);
    }

    groups = groupByExtension(instrDict);
    const shared = findSharedInstructions(instrDict);

    if (runTier1) {
      printSummaryTable(groups);
      printSharedInstructions(shared);
    }
  }

  // ── TIER 2 ────────────────────────────────────────────────────────────────
  if (runTier2) {
    console.log('── Tier 2: Cross-referencing with ISA Manual ───────────────────────');

    const manualSrcDir = path.resolve(args.manual);
    if (!fs.existsSync(manualSrcDir)) {
      console.error(
        `\nERROR: ISA manual directory not found: ${manualSrcDir}\n` +
        `Run:  git clone --depth=1 https://github.com/riscv/riscv-isa-manual.git\n` +
        `Then: node index.js --manual riscv-isa-manual/src`
      );
      if (args.tier === '2') process.exit(1);
    } else {
      try {
        const jsonExts   = extractJsonExtensions(instrDict);
        const manualExts = extractManualExtensions(manualSrcDir);
        console.log(`  JSON extensions  : ${jsonExts.size}`);
        console.log(`  Manual extensions: ${manualExts.size}`);
        const report = crossReference(jsonExts, manualExts);
        printCrossRefReport(report);
      } catch (err) {
        console.error(`ERROR in Tier 2: ${err.message}`);
      }
    }
  }

  // ── TIER 3 ────────────────────────────────────────────────────────────────
  if (runTier3) {
    console.log('── Tier 3: Extension Sharing Graph ─────────────────────────────────');
    const { adjacency, sharedDetails } = buildGraph(instrDict);
    printTextGraph(adjacency, sharedDetails);
    writeDotFile(adjacency, sharedDetails, './extension_graph.dot');
  }
}

main();
