/**
 * graph.js
 * Tier 3 Bonus: Build and render a text-based graph showing which extensions
 * share at least one instruction.  Also writes a Graphviz DOT file for
 * optional visual rendering.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Build adjacency list ──────────────────────────────────────────────────────

/**
 * Build an undirected adjacency list of extensions connected by shared instructions.
 * Two extensions are "connected" when the same instruction mnemonic belongs to both.
 *
 * @param {Object} instrDict - Raw instruction dictionary
 * @returns {{ adjacency: Map<string, Set<string>>, sharedDetails: Map<string, string[]> }}
 *   adjacency    : ext -> Set of neighbour exts
 *   sharedDetails: "extA||extB" (sorted) -> [mnemonics]
 */
function buildGraph(instrDict) {
  const adjacency    = new Map();
  const sharedDetails = new Map();

  for (const [mnemonic, info] of Object.entries(instrDict)) {
    const extensions = info.extension || [];
    if (extensions.length < 2) continue;

    // Register every pair
    for (let i = 0; i < extensions.length; i++) {
      for (let j = i + 1; j < extensions.length; j++) {
        const a = extensions[i];
        const b = extensions[j];

        // Adjacency
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);

        // Edge details
        const edgeKey = [a, b].sort().join('||');
        if (!sharedDetails.has(edgeKey)) sharedDetails.set(edgeKey, []);
        sharedDetails.get(edgeKey).push(mnemonic.toUpperCase());
      }
    }
  }

  // Add isolated nodes (extensions with no sharing)
  // (these are nodes not already in adjacency)
  // We skip this so the graph only shows connected nodes.

  return { adjacency, sharedDetails };
}

// ── Text-based graph rendering ────────────────────────────────────────────────

/**
 * Print a text adjacency list graph to stdout.
 * @param {Map<string, Set<string>>} adjacency
 * @param {Map<string, string[]>} sharedDetails
 */
function printTextGraph(adjacency, sharedDetails) {
  console.log('\n' + '═'.repeat(70));
  console.log('  Extension Sharing Graph (text adjacency list)');
  console.log('  An edge means ≥1 instruction belongs to both extensions.');
  console.log('═'.repeat(70));

  const nodes = [...adjacency.keys()].sort();
  for (const node of nodes) {
    const neighbours = [...adjacency.get(node)].sort();
    console.log(`\n  [${node}]`);
    for (const nb of neighbours) {
      const edgeKey = [node, nb].sort().join('||');
      const mnemonics = sharedDetails.get(edgeKey) || [];
      const sample = mnemonics.slice(0, 3).join(', ') +
                     (mnemonics.length > 3 ? ` … (+${mnemonics.length - 3} more)` : '');
      console.log(`    ──► ${nb}   [${sample}]`);
    }
  }

  // Edge summary
  const edgeCount = sharedDetails.size;
  const nodeCount = adjacency.size;
  console.log('\n' + '─'.repeat(70));
  console.log(`  Graph: ${nodeCount} connected nodes,  ${edgeCount} edges`);
  console.log('═'.repeat(70) + '\n');
}

// ── Graphviz DOT export ───────────────────────────────────────────────────────

/**
 * Write a Graphviz DOT file representing the extension-sharing graph.
 * @param {Map<string, Set<string>>} adjacency
 * @param {Map<string, string[]>} sharedDetails
 * @param {string} outputPath  Destination .dot file path
 */
function writeDotFile(adjacency, sharedDetails, outputPath) {
  const lines = [];
  lines.push('graph extension_sharing {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box, style=filled, fillcolor=lightyellow, fontname=Helvetica];');
  lines.push('  edge [fontname=Helvetica, fontsize=9];');
  lines.push('');

  // ── Legend ─────────────────────────────────────────────────────────────────
  lines.push('  subgraph cluster_legend {');
  lines.push('    label="Legend";');
  lines.push('    fontname=Helvetica;');
  lines.push('    fontsize=11;');
  lines.push('    style=filled;');
  lines.push('    fillcolor=lightyellow;');
  lines.push('    color=gray50;');
  lines.push('    margin=12;');
  lines.push('');
  lines.push('    legend_ext_a [label="Extension A", shape=box, style=filled, fillcolor=lightyellow, fontname=Helvetica, fontsize=10];');
  lines.push('    legend_ext_b [label="Extension B", shape=box, style=filled, fillcolor=lightyellow, fontname=Helvetica, fontsize=10];');
  lines.push('    legend_ext_a -- legend_ext_b [label="INSTR1,INSTR2+N", fontsize=9, style=dashed, color=gray40];');
  lines.push('');
  lines.push('    legend_node_desc  [shape=plain, label="Node  = a RISC-V extension (e.g. rv_zbb)", fontname=Helvetica, fontsize=9];');
  lines.push('    legend_edge_desc  [shape=plain, label="Edge  = two extensions share \u22651 instruction mnemonic", fontname=Helvetica, fontsize=9];');
  lines.push('    legend_label_desc [shape=plain, label="Label = first 2 shared mnemonics, +N = additional count", fontname=Helvetica, fontsize=9];');
  lines.push('  }');
  lines.push('');

  // ── Nodes ──────────────────────────────────────────────────────────────────
  for (const node of [...adjacency.keys()].sort()) {
    const safe = node.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`  ${safe} [label="${node}"];`);
  }

  lines.push('');

  // ── Edges (avoid duplicates by only emitting a < b) ────────────────────────
  const emitted = new Set();
  for (const [edgeKey, mnemonics] of [...sharedDetails.entries()].sort()) {
    if (emitted.has(edgeKey)) continue;
    emitted.add(edgeKey);

    const [a, b] = edgeKey.split('||');
    const safeA  = a.replace(/[^a-zA-Z0-9_]/g, '_');
    const safeB  = b.replace(/[^a-zA-Z0-9_]/g, '_');
    const label  = mnemonics.slice(0, 2).join(',') +
                   (mnemonics.length > 2 ? `+${mnemonics.length - 2}` : '');
    lines.push(`  ${safeA} -- ${safeB} [label="${label}"];`);
  }

  lines.push('}');

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`  Graphviz DOT file written → ${outputPath}`);
  console.log('  To render: dot -Tsvg extension_graph.dot -o extension_graph.svg\n');
}

// ── PNG conversion ────────────────────────────────────────────────────────────

/**
 * Convert a Graphviz DOT file to a PNG image using the system `dot` binary.
 *
 * The PNG is written alongside the DOT file with the same base name.
 * e.g. extension_graph_20260517_160511.dot → extension_graph_20260517_160511.png
 *
 * @param {string} dotPath  Absolute or relative path to the .dot file
 * @returns {string}        Path of the generated PNG file
 * @throws {Error}          If the `dot` binary is not found or rendering fails
 */
function convertDotToPng(dotPath) {
  const child_process = require('child_process');

  const pngPath = dotPath.replace(/\.dot$/i, '.png');

  try {
    child_process.execFileSync('dot', ['-Tpng', dotPath, '-o', pngPath], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'Graphviz `dot` binary not found. ' +
        'Install it with:  sudo apt install graphviz  (Debian/Ubuntu)\n' +
        '                  brew install graphviz       (macOS)\n' +
        '                  choco install graphviz      (Windows)'
      );
    }
    throw new Error(`dot rendering failed: ${err.stderr || err.message}`);
  }

  console.log(`  PNG image written      → ${pngPath}`);
  return pngPath;
}

module.exports = { buildGraph, printTextGraph, writeDotFile, convertDotToPng };