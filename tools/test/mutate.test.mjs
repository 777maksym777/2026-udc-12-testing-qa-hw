// Tests for tools/mutate.mjs: the tokenizer, the mutant list and a real run over a tiny
// fixture project (tools/test/fixtures/mutate) with known killed and surviving mutants.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyMutant, countAssertions, findMutants, formatReport, mutate, tokenize } from "../mutate.mjs";

const TOOL = fileURLToPath(new URL("../mutate.mjs", import.meta.url));
const FIXTURE_CONFIG = fileURLToPath(new URL("./fixtures/mutate/mutate.config.json", import.meta.url));
const FIXTURE_SOURCE = fileURLToPath(new URL("./fixtures/mutate/app/src/calc.js", import.meta.url));

const changes = (src) => findMutants(src).map((m) => `${m.original} → ${m.replacement}`);

test("the tokenizer keeps strings, templates, comments and regex literals whole", () => {
  const src = 'const a = "x < y"; // b > c\nconst t = `${a + 1} > ${b}`; /* d && e */ const r = /a+b/g.test(s) ? 1 : 2;';
  const types = tokenize(src).map((t) => t.type);
  assert.ok(types.includes("str"));
  assert.ok(types.includes("template"));
  assert.ok(types.includes("regex"));
  assert.equal(types.filter((t) => t === "comment").length, 2);
  assert.equal(tokenize(src).find((t) => t.type === "template").value, "`${a + 1} > ${b}`");
});

test("nothing inside strings, templates, comments or regexes is mutated", () => {
  const src = 'const s = "a < b && c"; const t = `${x * 2} - ${y}`; // p > q\nconst r = /x+y/;';
  assert.deepEqual(changes(src), []);
});

test("a regex after the head of if/while/for or after a block is a regex; after a value it is a division", () => {
  assert.deepEqual(changes("if (ok) /x+y/.test(s);"), []);
  assert.deepEqual(changes("while (a) /x-y/.test(s);"), []);
  assert.deepEqual(changes("for (const v of list) /a*b/.test(v);"), []);
  assert.deepEqual(changes("function f() {}\n/a-b/.test(s);"), []);
  assert.deepEqual(changes("if (a) -b;"), [], "a unary minus after an if head is not a subtraction");
  assert.deepEqual(changes("y = f(a) / 2;"), ["/ → *", "2 → 3"]);
  assert.deepEqual(changes("y = { a } / 2;"), ["/ → *", "2 → 3"]);
});

test("each operator family produces the expected mutants", () => {
  assert.deepEqual(changes("if (a < b) x();"), ["< → <="]);
  assert.deepEqual(changes("if (a >= b) x();"), [">= → >"]);
  assert.deepEqual(changes("if (a === b) x();"), ["=== → !=="]);
  assert.deepEqual(changes("y = a && b;"), ["&& → ||"]);
  assert.deepEqual(changes("y = a * b - c;"), ["* → /", "- → +"]);
  assert.deepEqual(changes("if (!ok) x();"), ["! → "]);
  assert.deepEqual(changes("y = Math.ceil(v);"), ["Math.ceil → Math.floor", "Math.ceil → Math.round"]);
  assert.deepEqual(changes("y = 60_000;"), ["60_000 → 60001"]);
  assert.deepEqual(changes("y = 0.5;"), ["0.5 → 1.5"]);
  assert.deepEqual(changes("y = true;"), ["true → false"]);
  assert.deepEqual(changes("y = c ? a.b : f(x, 2);"), ["a.b : f(x, 2) → f(x, 2) : a.b", "2 → 3"]);
});

test("unary minus, arrows, spread, ?? and ?. are left alone; a complex conditional is not swapped", () => {
  assert.deepEqual(changes("const f = (...a) => -a.length ?? b?.c;"), []);
  assert.deepEqual(changes("y = c ? a + 1 : b;"), ["+ → -", "1 → 2"]);
  assert.deepEqual(changes("y = list[0] + list[1];"), ["+ → -"]);
});

test("mutants carry line and column, and applying one changes exactly that spot", () => {
  const src = "const a = 1;\nif (x > 2) y();\n";
  const m = findMutants(src, "f.js").find((x) => x.original === ">");
  assert.equal(m.line, 2);
  assert.equal(m.col, 7);
  assert.equal(applyMutant(src, m), "const a = 1;\nif (x >= 2) y();\n");
});

test("assertion calls are counted statically, comments and imports excluded", () => {
  const src = 'import assert from "node:assert/strict";\n// assert.equal(1, 1)\nassert.equal(a, 1);\nassert(b);\nt.assert.ok(c);\nassert.deepEqual(x, y);';
  assert.equal(countAssertions(src), 4);
});

test("a run over the fixture: known survivors, killed mutants and a timeout", async () => {
  const before = readFileSync(FIXTURE_SOURCE, "utf8");
  const report = await mutate({ configPath: FIXTURE_CONFIG });
  const status = Object.fromEntries(report.mutants.map((m) => [`${m.id} ${m.original}→${m.replacement}`, m.status]));
  assert.deepEqual(status, {
    "M001 >=→>": "survived",
    "M002 18→19": "survived",
    "M003 *→/": "killed",
    "M004 0→1": "killed",
    "M005 >→>=": "killed",
    "M006 0→1": "killed",
    "M007 -→+": "timeout",
    "M008 1→2": "killed",
  });
  assert.deepEqual(report.summary.total, { mutants: 8, killed: 5, survived: 2, timeout: 1, score: 75 });
  assert.equal(report.suite.tests, 3);
  assert.equal(report.suite.assertions, 4);
  assert.equal(readFileSync(FIXTURE_SOURCE, "utf8"), before, "the target file must stay untouched");

  const text = formatReport(report);
  assert.match(text, /M001 +app\/src\/calc\.js:3:14/);
  assert.match(text, /разом +8 +5 +2 +1 +75\.0 %/);
});

test("the CLI: --list is stable, --min-score sets the exit code", () => {
  const list = () => execFileSync(process.execPath, [TOOL, "--config", FIXTURE_CONFIG, "--list"], { encoding: "utf8" });
  assert.equal(list(), list());
  assert.match(list(), /M007 {2}app\/src\/calc\.js:13:11 {2}arithmetic {2}- → \+/);

  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const low = spawnSync(process.execPath, [TOOL, "--config", FIXTURE_CONFIG, "--only", "app/src/calc.js", "--min-score", "90", "--no-survivors"], { encoding: "utf8", env });
  assert.equal(low.status, 1);
  assert.doesNotMatch(low.stdout, /Вижили/);
  const ok = spawnSync(process.execPath, [TOOL, "--config", FIXTURE_CONFIG, "--min-score", "70"], { encoding: "utf8", env });
  assert.equal(ok.status, 0);
});
