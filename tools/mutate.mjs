#!/usr/bin/env node
// Deterministic mutation testing for the app (Task C). No dependencies.
//
//   npm run mutate                                   targets and tests from tools/mutate.config.json
//   npm run mutate -- --only app/src/day-cap.js      one target
//   npm run mutate -- --json out/mutation.json       full report as JSON as well
//   npm run mutate -- --min-score 70                 exit 1 when the score is below 70 %
//   npm run mutate -- --no-survivors                 do not list the surviving mutants
//   npm run mutate -- --list                         only list the mutants, run nothing
//   node tools/mutate.mjs --config <file> --workers 4
//
// A mutant is one small change to a target file: `<` ↔ `<=`, `>` ↔ `>=`, `===` ↔ `!==`,
// `+` ↔ `-`, `*` ↔ `/`, `&&` ↔ `||`, a removed `!`, Math.ceil / floor / round swapped, a
// number n → n + 1, true ↔ false, the two branches of a simple `c ? a : b` swapped.
// Strings, template literals, comments and regular expressions are never mutated.
// Every mutant runs the test suite in a temporary copy of the app (the repo's files are
// never touched): a red suite KILLS the mutant, a green suite lets it SURVIVE, a run
// longer than the timeout is killed and reported as TIMEOUT (counts as detected).
// Score = (killed + timeout) / mutants. Ids M001… are stable for the same source and are
// numbered across all configured targets, so --only prints the same ids as a full run.
//
// Config (JSON): { "root": "..", "app": "app", "targets": ["app/src/x.js"],
//   "tests": ["test/unit", "test/spec"], "timeoutMs": 20000 }
// `root` is relative to the config file; `app` and `targets` to `root`; `tests` to `app`.
// Test directories that do not exist are skipped.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listTestFiles, parseTap, runNodeTest } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG = join(HERE, "mutate.config.json");

// ------------------------------------------------------------------ tokenizer

const PUNCTUATORS = [
  ">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=",
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "**", "<<", ">>",
  "{", "}", "(", ")", "[", "]", ";", ",", "<", ">", "+", "-", "*", "/", "%", "&", "|", "^", "!", "~",
  "?", ":", "=", ".", "@", "#",
];

// After these words an expression starts: `/` opens a regex, `+`/`-` are unary.
const EXPRESSION_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else",
  "yield", "await", "export", "import", "default", "extends",
]);

const isIdentStart = (ch) => /[\p{L}_$]/u.test(ch);
const isIdentPart = (ch) => /[\p{L}\p{N}_$‌‍]/u.test(ch);

/**
 * Splits JavaScript source into tokens: { type, value, start, end }.
 * Types: ident, num, str, template, regex, punct, comment.
 */
export function tokenize(src) {
  const { tokens } = scan(src, 0, false);
  return tokens;
}

// `(` after these words opens a statement head: after its `)` a new statement (so maybe a regex) starts.
const CONTROL_HEADS = new Set(["if", "while", "for", "with"]);
// `{` after these words opens a statement block.
const BLOCK_KEYWORDS = new Set(["else", "try", "finally", "do"]);

/** Is the `{` that follows `prev` a statement block ("block"), an arrow body ("arrow") or an object literal ("object")? */
function braceKind(prev) {
  if (!prev) return "block";
  if (prev.type === "punct") {
    if (prev.value === "=>") return "arrow";
    return [")", ";", "{", "}"].includes(prev.value) ? "block" : "object";
  }
  if (prev.type === "ident") {
    if (BLOCK_KEYWORDS.has(prev.value)) return "block";
    return EXPRESSION_KEYWORDS.has(prev.value) ? "object" : "block"; // `class A {`, `extends B {`
  }
  return "object";
}

function scan(src, start, untilBrace) {
  const tokens = [];
  let depth = 0;
  const parens = []; // for every open `(`: does it open an if/while/for/with head?
  const braces = []; // for every open `{`: its braceKind
  let i = start;
  if (start === 0 && src.startsWith("#!")) i = src.indexOf("\n") === -1 ? src.length : src.indexOf("\n");
  const push = (type, from, to) => tokens.push({ type, value: src.slice(from, to), start: from, end: to });
  /** The n-th last token that is not a comment (n = 1: the last one). */
  const lastSignificant = (n = 1) => {
    for (let k = tokens.length - 1; k >= 0; k--) if (tokens[k].type !== "comment" && --n === 0) return tokens[k];
    return null;
  };

  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      const to = end === -1 ? src.length : end;
      push("comment", i, to);
      i = to;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) throw new SyntaxError(`unterminated comment at ${i}`);
      push("comment", i, end + 2);
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const to = scanString(src, i, ch);
      push("str", i, to);
      i = to;
      continue;
    }
    if (ch === "`") {
      const to = scanTemplate(src, i);
      push("template", i, to);
      i = to;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const match = /^(0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(\d[\d_]*)?\.?[\d_]*([eE][+-]?\d+)?)n?/.exec(src.slice(i));
      const to = i + Math.max(1, match[0].length);
      push("num", i, to);
      i = to;
      continue;
    }
    if (isIdentStart(ch) || ch === "\\") {
      let to = i + 1;
      while (to < src.length && isIdentPart(src[to])) to++;
      push("ident", i, to);
      i = to;
      continue;
    }
    if (ch === "/" && regexAllowed(lastSignificant())) {
      const to = scanRegex(src, i);
      push("regex", i, to);
      i = to;
      continue;
    }
    let regexAfter = false; // set on a `)` or `}` after which a statement (so maybe a regex) starts
    let closes = null; // on a `}`: the braceKind it closes
    if (ch === "{") {
      depth++;
      braces.push(braceKind(lastSignificant()));
    }
    if (ch === "}") {
      if (untilBrace && depth === 0) return { tokens, end: i + 1 };
      depth--;
      closes = braces.pop() ?? "block";
      regexAfter = closes === "block";
    }
    if (ch === "(") {
      const prev = lastSignificant();
      const head = prev?.type === "ident" && (CONTROL_HEADS.has(prev.value) || (prev.value === "await" && lastSignificant(2)?.value === "for"));
      parens.push(head);
    }
    if (ch === ")") regexAfter = parens.pop() === true;
    let op = PUNCTUATORS.find((p) => src.startsWith(p, i));
    if (op === "?." && /[0-9]/.test(src[i + 2] ?? "")) op = "?";
    if (!op) throw new SyntaxError(`unexpected character ${JSON.stringify(ch)} at ${i}`);
    push("punct", i, i + op.length);
    if (regexAfter) tokens.at(-1).regexAfter = true;
    if (closes) tokens.at(-1).closes = closes;
    i += op.length;
  }
  if (untilBrace) throw new SyntaxError("unterminated template expression");
  return { tokens, end: i };
}

function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.type === "punct") {
    if (prev.value === ")" || prev.value === "}") return prev.regexAfter === true;
    return prev.value !== "]";
  }
  if (prev.type === "ident") return EXPRESSION_KEYWORDS.has(prev.value);
  return false;
}

function scanString(src, i, quote) {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") j++;
    else if (src[j] === quote) return j + 1;
    else if (src[j] === "\n") break;
  }
  throw new SyntaxError(`unterminated string at ${i}`);
}

function scanTemplate(src, i) {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") j++;
    else if (src[j] === "`") return j + 1;
    else if (src[j] === "$" && src[j + 1] === "{") j = scan(src, j + 2, true).end - 1;
  }
  throw new SyntaxError(`unterminated template literal at ${i}`);
}

function scanRegex(src, i) {
  let inClass = false;
  for (let j = i + 1; j < src.length; j++) {
    const ch = src[j];
    if (ch === "\\") j++;
    else if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) {
      let to = j + 1;
      while (to < src.length && /[a-z]/i.test(src[to])) to++;
      return to;
    } else if (ch === "\n") break;
  }
  throw new SyntaxError(`unterminated regular expression at ${i}`);
}

// ------------------------------------------------------------------ mutants

const SWAPS = {
  "<": "<=", "<=": "<", ">": ">=", ">=": ">",
  "===": "!==", "!==": "===", "==": "!=", "!=": "==",
  "&&": "||", "||": "&&",
};
const ARITHMETIC = { "+": "-", "-": "+", "*": "/", "/": "*" };
const ROUNDING = { ceil: ["floor", "round"], floor: ["ceil", "round"], round: ["ceil", "floor"] };
const OPERAND_PUNCT = new Set([".", "?."]);
const TERMINATORS = new Set([",", ";", ")", "]", "}"]);

/** The operand on the left of a binary operator ends with one of these. */
function endsOperand(token) {
  if (!token) return false;
  if (["num", "str", "template", "regex"].includes(token.type)) return true;
  if (token.type === "ident") return !EXPRESSION_KEYWORDS.has(token.value);
  if (token.type !== "punct") return false;
  if (token.value === "]") return true;
  if (token.value === ")") return !token.regexAfter; // not the `)` of an if/while/for head
  return token.value === "}" && token.closes === "object"; // `{ a } / 2`
}

/**
 * All mutants of one source file, in source order.
 * @returns {Array<{ file, line, col, operator, start, end, original, replacement }>}
 */
export function findMutants(src, file = "<source>") {
  const tokens = tokenize(src).filter((t) => t.type !== "comment");
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStarts.push(i + 1);
  const where = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - lineStarts[lo] + 1 };
  };

  const mutants = [];
  const add = (operator, start, end, replacement) => {
    mutants.push({ file, ...where(start), operator, start, end, original: src.slice(start, end), replacement });
  };

  tokens.forEach((t, k) => {
    const prev = tokens[k - 1];
    const next = tokens[k + 1];
    if (t.type === "punct") {
      if (SWAPS[t.value]) {
        const kind = ["&&", "||"].includes(t.value) ? "logical" : t.value.includes("=") && t.value.length > 2 ? "equality" : ["==", "!="].includes(t.value) ? "equality" : "relational";
        add(kind, t.start, t.end, SWAPS[t.value]);
      } else if (ARITHMETIC[t.value] && endsOperand(prev)) {
        add("arithmetic", t.start, t.end, ARITHMETIC[t.value]);
      } else if (t.value === "!") {
        add("negation", t.start, t.end, "");
      } else if (t.value === "?") {
        const swap = simpleConditional(tokens, k);
        if (swap) {
          const [x, y] = swap;
          const xText = src.slice(x.start, x.end);
          const yText = src.slice(y.start, y.end);
          add("conditional", x.start, y.end, yText + src.slice(x.end, y.start) + xText);
        }
      }
    } else if (t.type === "ident") {
      if (t.value === "true" || t.value === "false") {
        if (prev?.value !== "." && prev?.value !== "?.") add("boolean", t.start, t.end, t.value === "true" ? "false" : "true");
      } else if (t.value === "Math" && next?.value === "." && ROUNDING[tokens[k + 2]?.value] && prev?.value !== ".") {
        const method = tokens[k + 2];
        for (const other of ROUNDING[method.value]) add("rounding", t.start, method.end, `Math.${other}`);
      }
    } else if (t.type === "num") {
      const plain = t.value.replace(/_/g, "");
      if (!/^(\d+|\d*\.\d+|\d+\.\d*)$/.test(plain)) return;
      if (prev?.value === "[" && next?.value === "]" && (plain === "0" || plain === "1")) return;
      const value = Number(plain) + 1;
      add("number", t.start, t.end, String(Number.isInteger(value) ? value : Number(value.toFixed(10))));
    }
  });
  return mutants;
}

/** For `c ? a : b` with plain operands returns the token spans of a and b, otherwise null. */
function simpleConditional(tokens, q) {
  const operand = (from, stopAtColon) => {
    let depth = 0;
    let k = from;
    for (; k < tokens.length; k++) {
      const t = tokens[k];
      if (t.type === "punct") {
        if (["(", "[", "{"].includes(t.value)) depth++;
        else if ([")", "]", "}"].includes(t.value)) {
          if (depth === 0) break;
          depth--;
        } else if (depth === 0) {
          if (stopAtColon && t.value === ":") break;
          if (TERMINATORS.has(t.value)) break;
          if (!OPERAND_PUNCT.has(t.value)) return null;
        }
      } else if (t.type === "ident" && depth === 0 && EXPRESSION_KEYWORDS.has(t.value)) {
        return null;
      }
    }
    if (k === from || depth !== 0) return null;
    return { first: from, last: k - 1, stop: tokens[k] };
  };
  const x = operand(q + 1, true);
  if (!x || x.stop?.value !== ":") return null;
  const y = operand(x.last + 2, false);
  if (!y || (y.stop && !TERMINATORS.has(y.stop.value))) return null;
  return [
    { start: tokens[x.first].start, end: tokens[x.last].end },
    { start: tokens[y.first].start, end: tokens[y.last].end },
  ];
}

export function applyMutant(src, mutant) {
  return src.slice(0, mutant.start) + mutant.replacement + src.slice(mutant.end);
}

// ------------------------------------------------------------------ the suite

/** Static count of assertion calls (`assert(…)`, `assert.x(…)`, `t.assert.x(…)`) in test files. */
export function countAssertions(src) {
  const tokens = tokenize(src).filter((t) => t.type !== "comment");
  let count = 0;
  tokens.forEach((t, k) => {
    if (t.type !== "ident" || t.value !== "assert") return;
    const next = tokens[k + 1];
    if (next?.value === "(") count++;
    else if (next?.value === "." && tokens[k + 2]?.type === "ident" && tokens[k + 3]?.value === "(") count++;
  });
  return count;
}

export function loadConfig(configPath = DEFAULT_CONFIG) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const root = resolve(dirname(configPath), config.root ?? ".");
  return {
    root,
    app: resolve(root, config.app ?? "app"),
    targets: (config.targets ?? []).map((t) => resolve(root, t)),
    tests: config.tests ?? ["test"],
    timeoutMs: config.timeoutMs ?? 20_000,
  };
}

const display = (root, path) => relative(root, path).split(sep).join("/");

// ------------------------------------------------------------------ running

/**
 * Runs the whole mutation analysis.
 * @returns {Promise<object>} the report (see --json)
 */
export async function mutate({ configPath = DEFAULT_CONFIG, only = null, workers = null, list = false, log = () => {} } = {}) {
  const started = performance.now();
  const config = loadConfig(configPath);
  let targets = config.targets;
  if (only) {
    const wanted = resolve(only);
    targets = targets.filter((t) => t === wanted || display(config.root, t) === only.replace(/\\/g, "/") || t.endsWith(`${sep}${only}`));
    if (targets.length === 0) throw new Error(`--only ${only}: немає такої цілі в конфігурації`);
  }
  for (const target of targets) {
    if (!existsSync(target)) throw new Error(`ціль не знайдено: ${target}`);
    if (relative(config.app, target).startsWith("..")) throw new Error(`ціль ${target} лежить поза ${config.app}`);
  }

  // Ids are numbered across ALL configured targets, so `--only` prints the same M… as a full run.
  const selected = new Set(targets);
  const mutants = [];
  let seq = 0;
  for (const target of config.targets) {
    if (!selected.has(target) && !existsSync(target)) continue;
    for (const m of findMutants(readFileSync(target, "utf8"), display(config.root, target))) {
      seq++;
      if (selected.has(target)) mutants.push({ ...m, target, id: `M${String(seq).padStart(3, "0")}` });
    }
  }

  const testFiles = listTestFiles(config.app, config.tests);
  const assertions = testFiles.reduce((n, f) => n + countAssertions(readFileSync(join(config.app, f), "utf8")), 0);
  const suite = {
    dirs: config.tests.filter((d) => existsSync(join(config.app, d))).map((d) => display(config.root, join(config.app, d))),
    files: testFiles.length,
    assertions,
  };
  const report = { root: config.root, targets: targets.map((t) => display(config.root, t)), suite, mutants: [] };

  if (list) {
    report.mutants = mutants.map(strip);
    return report;
  }
  if (testFiles.length === 0) throw new Error(`у ${config.tests.join(", ")} немає файлів *.test.js`);

  const count = workers ?? Math.max(1, Math.min(8, Math.floor(availableParallelism() / 3)));
  const copies = [];
  try {
    for (let w = 0; w < Math.min(count, Math.max(1, mutants.length)); w++) {
      const dir = mkdtempSync(join(tmpdir(), "mutate-"));
      cpSync(config.app, dir, {
        recursive: true,
        filter: (src) => !/[\\/](node_modules|coverage|out)$/.test(src),
      });
      copies.push(dir);
    }

    const baseline = await runNodeTest({ cwd: copies[0], files: testFiles, reporter: "tap", timeoutMs: config.timeoutMs * 3 });
    const tap = parseTap(baseline.stdout);
    suite.tests = tap.summary.tests ?? 0;
    suite.skipped = tap.summary.skipped ?? 0;
    suite.todo = tap.summary.todo ?? 0;
    suite.baselineMs = Math.round(baseline.ms);
    if (baseline.code !== 0) {
      const failed = tap.results.filter((r) => !r.ok && r.leaf).map((r) => r.path.join(" › "));
      const error = new Error(`набір тестів червоний ще до мутацій (${failed.length || "?"} падінь): ${failed.slice(0, 5).join("; ")}`);
      error.code = "BASELINE";
      throw error;
    }
    log(`мутантів: ${mutants.length}, паралельно: ${copies.length}, базовий прогін: ${suite.baselineMs} мс`);

    const originals = new Map(targets.map((t) => [t, readFileSync(t, "utf8")]));
    let next = 0;
    let done = 0;
    const worker = async (dir) => {
      while (next < mutants.length) {
        const m = mutants[next++];
        const file = join(dir, relative(config.app, m.target));
        const original = originals.get(m.target);
        writeFileSync(file, applyMutant(original, m));
        try {
          const run = await runNodeTest({ cwd: dir, files: testFiles, reporter: "dot", timeoutMs: config.timeoutMs });
          m.status = run.timedOut ? "timeout" : run.code === 0 ? "survived" : "killed";
          m.ms = Math.round(run.ms);
        } finally {
          writeFileSync(file, original);
        }
        done++;
        if (done % 10 === 0 || done === mutants.length) log(`  ${done}/${mutants.length}`);
      }
    };
    await Promise.all(copies.map((dir) => worker(dir)));
  } finally {
    for (const dir of copies) rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }

  report.mutants = mutants.map(strip);
  report.summary = summarize(report.mutants, report.targets);
  report.durationMs = Math.round(performance.now() - started);
  return report;
}

function strip({ target, start, end, ...rest }) {
  return rest;
}

export function summarize(mutants, targets) {
  const row = (list) => {
    const killed = list.filter((m) => m.status === "killed").length;
    const timeout = list.filter((m) => m.status === "timeout").length;
    const survived = list.filter((m) => m.status === "survived").length;
    const score = list.length ? ((killed + timeout) / list.length) * 100 : 0;
    return { mutants: list.length, killed, survived, timeout, score: Math.round(score * 10) / 10 };
  };
  return {
    files: Object.fromEntries(targets.map((t) => [t, row(mutants.filter((m) => m.file === t))])),
    total: row(mutants),
  };
}

// ------------------------------------------------------------------ output

export function formatReport(report, { survivors = true } = {}) {
  const out = [];
  const { suite } = report;
  out.push("Мутаційне тестування");
  out.push(`  цілі:   ${report.targets.join(", ")}`);
  out.push(`  тести:  ${suite.dirs.join(", ")} — файлів: ${suite.files}, тестів: ${suite.tests}` +
    `, пропущено: ${suite.skipped}, todo: ${suite.todo}, викликів assert: ${suite.assertions}`);
  out.push("");
  const width = Math.max(6, ...report.targets.map((t) => t.length));
  const head = ["мутантів", "вбито", "вижило", "таймаут", "score"];
  out.push(`${"файл".padEnd(width)}  ${head.map((h) => h.padStart(8)).join("  ")}`);
  const line = (name, r) =>
    `${name.padEnd(width)}  ${[r.mutants, r.killed, r.survived, r.timeout].map((v) => String(v).padStart(8)).join("  ")}  ${`${r.score.toFixed(1)} %`.padStart(8)}`;
  for (const t of report.targets) out.push(line(t, report.summary.files[t]));
  out.push(line("разом", report.summary.total));

  const alive = report.mutants.filter((m) => m.status === "survived");
  if (survivors && alive.length) {
    out.push("");
    out.push(`Вижили (${alive.length}) — тести не помітили цієї зміни:`);
    const sources = new Map();
    for (const m of alive) {
      if (!sources.has(m.file)) sources.set(m.file, readFileSync(join(report.root, m.file), "utf8").split(/\r?\n/));
      const code = sources.get(m.file)[m.line - 1].trim();
      const where = `${m.file}:${m.line}:${m.col}`;
      const short = (s) => (s.length > 18 ? `${s.slice(0, 15)}...` : s);
      const change = `${short(m.original)} → ${m.replacement === "" ? "(прибрано)" : short(m.replacement)}`;
      out.push(`  ${m.id}  ${where.padEnd(width + 8)}  ${change.padEnd(26)}  ${code.length > 70 ? `${code.slice(0, 67)}...` : code}`);
    }
  }
  const timeouts = report.mutants.filter((m) => m.status === "timeout");
  if (timeouts.length) out.push("", `Таймаут (зараховано як вбиті): ${timeouts.map((m) => m.id).join(", ")}`);
  out.push("", `Час: ${(report.durationMs / 1000).toFixed(1)} с`);
  return out.join("\n");
}

function parseArgs(argv) {
  const opts = { survivors: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg}: потрібне значення`);
      return argv[++i];
    };
    if (arg === "--config") opts.configPath = resolve(value());
    else if (arg === "--only") opts.only = value();
    else if (arg === "--json") opts.json = value();
    else if (arg === "--min-score") opts.minScore = Number(value());
    else if (arg === "--workers") opts.workers = Number(value());
    else if (arg === "--survivors") opts.survivors = true;
    else if (arg === "--no-survivors") opts.survivors = false;
    else if (arg === "--list") opts.list = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`невідомий аргумент: ${arg}`);
  }
  if (opts.minScore !== undefined && Number.isNaN(opts.minScore)) throw new Error("--min-score: потрібне число");
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  let report;
  try {
    report = await mutate({ ...opts, log: (msg) => console.error(msg) });
  } catch (err) {
    console.error(`Помилка: ${err.message}`);
    process.exit(2);
  }
  if (opts.list) {
    for (const m of report.mutants) console.log(`${m.id}  ${m.file}:${m.line}:${m.col}  ${m.operator.padEnd(11)} ${m.original} → ${m.replacement || "(прибрано)"}`);
    console.log(`\nМутантів: ${report.mutants.length}`);
    return;
  }
  console.log(formatReport(report, opts));
  if (opts.json) {
    const out = resolve(opts.json);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`JSON: ${display(process.cwd(), out)}`);
  }
  if (opts.minScore !== undefined && report.summary.total.score < opts.minScore) {
    console.log(`Score ${report.summary.total.score} % нижчий за --min-score ${opts.minScore} %`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
