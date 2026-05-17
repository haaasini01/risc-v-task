# RISC-V Instruction Set Explorer

A Node.js command-line tool that parses `instr_dict.json`, cross-references the RISC-V ISA manual, and graphs extension sharing relationships.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v16 or newer (no npm packages required — only Node built-ins are used)
- [Git](https://git-scm.com/) (to clone the ISA manual for Tier 2)

---

## Installation

```bash
git clone https://github.com/haaasini01/risc-v-task
cd risc-v-task
```

No `npm install` needed — zero external dependencies.

Place `instr_dict.json` in the project root (from the
[riscv-extensions-landscape](https://github.com/rpsene/riscv-extensions-landscape) repo).

For Tier 2, clone the ISA manual into the project root:

```bash
git clone --depth=1 https://github.com/riscv/riscv-isa-manual.git
```

---

## Running

### All tiers at once (default)

```bash
node index.js
```

### Individual tiers

```bash
node index.js --tier 1    # Tier 1: parsing & grouping only
node index.js --tier 2    # Tier 2: cross-reference only
node index.js --tier 3    # Tier 3: extension sharing graph only
```

### Custom paths

```bash
node index.js --json /path/to/instr_dict.json --manual /path/to/riscv-isa-manual/src
```

### npm shorthand scripts

```bash
npm start          # all tiers
npm test           # unit tests
npm run tier1
npm run tier2
npm run tier3
```

---

## Unit Tests

```bash
node tests.js
```

Runs 25 tests covering parsing, normalisation, cross-referencing, and graph construction — no test framework required.

---

## Sample Output

### Tier 1 — Extension Summary Table

```
════════════════════════════════════════════════════════════
  RISC-V Extension Summary Table
════════════════════════════════════════════════════════════
Extension             Count   Example Mnemonic
────────────────────────────────────────────────────────────
rv32_zk               10      AES32DSI
rv64_zba              5       ADD_UW
rv_i                  37      ADD
rv_v                  627     VAADD_VV
...
────────────────────────────────────────────────────────────
Total extensions: 114
Total instruction-extension pairs: 1396
```

### Tier 1 — Shared Instructions

```
════════════════════════════════════════════════════════════
  Instructions Belonging to Multiple Extensions
════════════════════════════════════════════════════════════
  AES32DSI
    → rv32_zknd, rv32_zk, rv32_zkn
  SH1ADD
    → rv_zba, rv32_zba
...
Total shared instructions: 73
```

### Tier 2 — Cross-Reference

```
══════════════════════════════════════════════════════════════════════
  RISC-V Cross-Reference Report: JSON ↔ ISA Manual
══════════════════════════════════════════════════════════════════════

✔  Matched Extensions (56)
  zba               rv_zba              Zba
  zbb               rv_zbb              Zbb
  ...

✘  In JSON only — NOT found in ISA Manual (39)
  ssctr             (as "rv_ssctr")
  ...

✘  In ISA Manual only — NOT found in JSON (19)
  ...

  Summary: 56 matched,  39 in JSON only,  19 in manual only
```

### Tier 3 — Extension Sharing Graph

```
  [rv_zk]
    ──► rv_zbb   [ANDN, ORN, ROL … (+2 more)]
    ──► rv_zbc   [CLMUL, CLMULH]
    ──► rv_zbkb  [ANDN, ORN, PACK … (+4 more)]
    ...

  Graph: 32 connected nodes,  57 edges
  Graphviz DOT file written → ./extension_graph.dot
  To render: dot -Tsvg extension_graph.dot -o extension_graph.svg
```

---

## Project Structure

```
riscv-instruction-set-explorer/
├── index.js            # Entry point & CLI
├── package.json
├── tests.js            # 25 unit tests (no framework needed)
├── instr_dict.json     # Input — place here
├── riscv-isa-manual/   # Cloned ISA manual (for Tier 2)
├── extension_graph.dot # Generated Graphviz file (Tier 3)
└── src/
    ├── parser.js       # Tier 1: parsing & grouping
    ├── crossref.js     # Tier 2: normalisation & cross-reference
    └── graph.js        # Tier 3: graph building & rendering
```

---

## Design Decisions

### Extension normalisation (Tier 2)
The JSON file uses prefixes like `rv_`, `rv32_`, `rv64_` (e.g. `rv_zba`, `rv64_zba`),
while the ISA manual uses bare names like `Zba`, `M`, `F`, `RV32I`.
The `normalise()` function strips these prefixes and lowercases everything so
`rv_zba`, `rv32_zba`, `rv64_zba`, and `Zba` all map to the key `zba`.

### Manual scanning strategy (Tier 2)
Rather than parsing AsciiDoc AST, the manual's `.adoc` files are scanned with a
regex that matches:
- `Z[a-z][a-zA-Z0-9]{1,14}` — Z-extensions (e.g. `Zba`, `Zicsr`)
- `RV(?:32|64)?[A-Z][A-Za-z0-9]*` — base ISA names (e.g. `RV32I`, `RVWMO`)
- `[IMAFDQC]` — single-letter base ISA identifiers

This is intentionally broad; it produces some false positives in "manual only"
that represent tokens in context (author initials, acronyms, etc.).

### Graph (Tier 3)
Only extensions with ≥2 shared instructions in the same mnemonic entry appear as
nodes. Isolated extensions (all single-extension instructions) are omitted to keep
the graph readable. A Graphviz `.dot` file is also written for visual rendering.

### No external dependencies
The entire project uses only Node.js built-in modules (`fs`, `path`, `assert`),
making installation trivially simple.
