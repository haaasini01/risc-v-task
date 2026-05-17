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
const child_process = require('child_process');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function makeTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}

function createOutputCollector() {
  const timestamp = makeTimestamp();
  const fileName = `sample_output_${timestamp}.txt`;
  const outputPath = path.resolve(process.cwd(), fileName);
  const buffer = [];
  function writeLine(...args) {
    buffer.push(args.map(String).join(' '));
  }
  function writeLines(text) {
    for (const line of String(text).split(/\r?\n/)) {
      buffer.push(line);
    }
  }
  return { timestamp, outputPath, buffer, writeLine, writeLines };
}

function parseTestResults(output) {
  const match = output.match(/Results:\s*(\d+) passed,\s*(\d+) failed/);
  if (match) {
    return { passed: Number(match[1]), failed: Number(match[2]) };
  }
  return { passed: 0, failed: 0 };
}

function runTests() {
  const testPath = path.resolve(__dirname, 'tests.js');
  try {
    const stdout = child_process.execFileSync(process.execPath, [testPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const { passed, failed } = parseTestResults(stdout);
    return { success: true, passed, failed, output: stdout, stderr: '' };
  } catch (err) {
    const stdout = err.stdout ? String(err.stdout) : '';
    const stderr = err.stderr ? String(err.stderr) : err.message;
    const { passed, failed } = parseTestResults(stdout);
    return { success: false, passed, failed, output: stdout, stderr };
  }
}

function writeOutputFile(outputPath, buffer, summary) {
  const lines = [];
  lines.push('════════════════════════════════════════════════════════════════════════════════════');
  lines.push('  OUTPUT SUMMARY');
  lines.push('════════════════════════════════════════════════════════════════════════════════════');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Output file: ${outputPath}`);
  lines.push(`Tier: ${summary.tier}`);
  lines.push(`JSON source: ${summary.json}`);
  lines.push(`Manual source: ${summary.manual}`);
  lines.push('');

  if (summary.tier1.run) {
    lines.push('Tier 1: Instruction summary');
    lines.push(`  Extensions: ${summary.tier1.extensions}`);
    lines.push(`  Instruction-extension pairs: ${summary.tier1.instrPairs}`);
    lines.push(`  Shared instructions: ${summary.tier1.sharedInstructions}`);
    lines.push('');
  }

  if (summary.tier2.run) {
    lines.push('Tier 2: Cross-reference summary');
    lines.push(`  Matched extensions: ${summary.tier2.matched}`);
    lines.push(`  JSON-only extensions: ${summary.tier2.jsonOnly}`);
    lines.push(`  Manual-only extensions: ${summary.tier2.manualOnly}`);
    lines.push('');
  }

  if (summary.tier3.run) {
    lines.push('Tier 3: Graph summary');
    lines.push(`  Connected nodes: ${summary.tier3.nodes}`);
    lines.push(`  Edges: ${summary.tier3.edges}`);
    if (summary.tier3.dotFile) {
      lines.push(`  DOT file: ${summary.tier3.dotFile}`);
    }
    if (summary.tier3.pngFile) {
      lines.push(`  PNG file: ${summary.tier3.pngFile}`);
    }
    lines.push(`  Unit tests run: ${summary.tier3.tests.executed ? 'yes' : 'no'}`);
    if (summary.tier3.tests.executed) {
      lines.push(`  Tests passed: ${summary.tier3.tests.passed}`);
      lines.push(`  Tests failed: ${summary.tier3.tests.failed}`);
    }
    lines.push('');
  }

  if (summary.errors.length) {
    lines.push('Errors / warnings:');
    summary.errors.forEach((err) => lines.push(`  - ${err}`));
    lines.push('');
  }

  lines.push('════════════════════════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(...buffer);

  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
}

const { loadInstrDict, groupByExtension, findSharedInstructions,
        printSummaryTable, printSharedInstructions } = require('./src/parser');

const { extractJsonExtensions, extractManualExtensions,
        crossReference, printCrossRefReport }         = require('./src/crossref');

const { buildGraph, printTextGraph, writeDotFile,
        convertDotToPng }                             = require('./src/graph');

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
  const runTier1 = args.tier === '1' || args.tier === 'all';
  const runTier2 = args.tier === '2' || args.tier === 'all';
  const runTier3 = args.tier === '3' || args.tier === 'all';

  const { timestamp, outputPath, buffer, writeLine, writeLines } = createOutputCollector();
  const dotOutputPath = path.resolve(process.cwd(), `extension_graph_${timestamp}.dot`);
  const summary = {
    tier: args.tier,
    json: args.json,
    manual: args.manual,
    errors: [],
    tier1: { run: runTier1, extensions: 0, instrPairs: 0, sharedInstructions: 0 },
    tier2: { run: runTier2, matched: 0, jsonOnly: 0, manualOnly: 0 },
    tier3: { run: runTier3, nodes: 0, edges: 0, dotFile: dotOutputPath, tests: { executed: false, passed: 0, failed: 0, success: false } },
  };

  const originalConsoleLog = console.log.bind(console);
  const originalConsoleError = console.error.bind(console);

  console.log = (...args) => writeLine(...args);
  console.error = (...args) => {
    const message = args.map(String).join(' ');
    writeLine(message);
    summary.errors.push(message);
  };

  originalConsoleLog(`Output file:            ${outputPath}`);
  if (runTier3) {
    originalConsoleLog(`Graph DOT file:         ${dotOutputPath}`);
    originalConsoleLog(`Graph PNG file:         ${dotOutputPath.replace(/\.dot$/, '.png')}`);
  }


  writeLine('\nRISC-V Instruction Set Explorer');
  writeLine(`    JSON  : ${args.json}`);
  writeLine(`    Manual: ${args.manual}`);
  writeLine(`    Tier  : ${args.tier}\n`);

  let instrDict;
  let groups;

  if (runTier1 || runTier2 || runTier3) {
    writeLine('── Tier 1: Parsing instr_dict.json ─────────────────────────────────');
    try {
      instrDict = loadInstrDict(args.json);
    } catch (err) {
      console.error(`ERROR loading JSON: ${err.message}`);
      summary.errors.push(err.message);
      process.exitCode = 1;
      writeOutputFile(outputPath, buffer, summary);
      return;
    }

    groups = groupByExtension(instrDict);
    const shared = findSharedInstructions(instrDict);

    summary.tier1.extensions = groups.size;
    summary.tier1.instrPairs = [...groups.values()].reduce((sum, items) => sum + items.length, 0);
    summary.tier1.sharedInstructions = shared.length;

    if (runTier1) {
      printSummaryTable(groups);
      printSharedInstructions(shared);
    }
  }

  if (runTier2) {
    writeLine('── Tier 2: Cross-referencing with ISA Manual ───────────────────────');

    const manualSrcDir = path.resolve(args.manual);
    if (!fs.existsSync(manualSrcDir)) {
      console.error(
        `\nERROR: ISA manual directory not found: ${manualSrcDir}\n` +
        `Run:  git clone --depth=1 https://github.com/riscv/riscv-isa-manual.git\n` +
        `Then: node index.js --manual riscv-isa-manual/src`
      );
      if (args.tier === '2') {
        process.exitCode = 1;
        writeOutputFile(outputPath, buffer, summary);
        return;
      }
    } else {
      try {
        const jsonExts   = extractJsonExtensions(instrDict);
        const manualExts = extractManualExtensions(manualSrcDir);
        writeLine(`  JSON extensions  : ${jsonExts.size}`);
        writeLine(`  Manual extensions: ${manualExts.size}`);
        const report = crossReference(jsonExts, manualExts);
        summary.tier2.matched = report.matched.length;
        summary.tier2.jsonOnly = report.jsonOnly.length;
        summary.tier2.manualOnly = report.manualOnly.length;
        printCrossRefReport(report);
      } catch (err) {
        console.error(`ERROR in Tier 2: ${err.message}`);
      }
    }
  }

  if (runTier3) {
    writeLine('── Tier 3: Extension Sharing Graph + Unit Tests ────────────────────────');
    const { adjacency, sharedDetails } = buildGraph(instrDict);
    summary.tier3.nodes = adjacency.size;
    summary.tier3.edges = sharedDetails.size;
    printTextGraph(adjacency, sharedDetails);
    writeDotFile(adjacency, sharedDetails, dotOutputPath);

    // Convert the DOT file to a PNG image immediately after writing it
    let pngOutputPath;
    try {
      pngOutputPath = convertDotToPng(dotOutputPath);
      summary.tier3.pngFile = pngOutputPath;
    } catch (err) {
      console.error(`WARNING: PNG conversion skipped — ${err.message}`);
    }

    const testReport = runTests();
    summary.tier3.tests = {
      executed: true,
      passed: testReport.passed,
      failed: testReport.failed,
      success: testReport.success,
    };

    writeLine('── Unit tests (Tier 3) ───────────────────────────────────────────────');
    if (testReport.output) {
      writeLines(testReport.output.trim());
    }
    if (testReport.stderr) {
      writeLine('--- STDERR ---');
      writeLines(testReport.stderr.trim());
    }
  }

  writeOutputFile(outputPath, buffer, summary);
}

main();