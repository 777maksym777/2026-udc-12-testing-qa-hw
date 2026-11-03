// Tests for tools/repeat.mjs and the TAP parser in tools/lib.mjs. The fixture suite
// (tools/test/fixtures/repeat) has a test that fails on the runs listed in
// REPEAT_FIXTURE_FAIL_ON, so the outcome is known in advance; tools/test/fixtures/repeat-dup
// has two files with a test of the same name.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listTestFiles, parseTap } from "../lib.mjs";
import { formatRepeat, repeat } from "../repeat.mjs";

const TOOL = fileURLToPath(new URL("../repeat.mjs", import.meta.url));
const FIXTURE_APP = fileURLToPath(new URL("./fixtures/repeat/app", import.meta.url));
const DUP_APP = fileURLToPath(new URL("./fixtures/repeat-dup/app", import.meta.url));

const SAMPLE_TAP = `TAP version 13
# Subtest: top \\# one
ok 1 - top \\# one
  ---
  duration_ms: 0.5
  type: 'test'
  ...
# Subtest: group
    # Subtest: inner
    not ok 1 - inner
      ---
      duration_ms: 1.2
      type: 'test'
      error: |-
        expected 3

        got 2
      code: 'ERR_ASSERTION'
      ...
    # Subtest: later
    ok 2 - later # SKIP not today
      ---
      type: 'test'
      ...
    1..2
not ok 2 - group
  ---
  type: 'suite'
  error: '1 subtest failed'
  ...
# Subtest: plain
not ok 3 - plain
  ---
  type: 'test'
  error: 'it''s red'
  ...
1..3
# tests 3
# suites 1
# pass 1
# fail 2
# skipped 1
`;

test("parseTap reads nested names, results, directives, errors and the summary", () => {
  const { results, summary } = parseTap(SAMPLE_TAP);
  const leaves = results.filter((r) => r.leaf).map((r) => [r.path.join(" › "), r.ok, r.skip, r.error]);
  assert.deepEqual(leaves, [
    ["top # one", true, false, null],
    ["group › inner", false, false, "expected 3 got 2"],
    ["group › later", true, true, null],
    ["plain", false, false, "it's red"],
  ]);
  assert.equal(results.find((r) => r.path.join() === "group").leaf, false);
  assert.deepEqual(summary, { tests: 3, suites: 1, pass: 1, fail: 2, skipped: 1 });
});

test("listTestFiles finds *.test.js recursively and skips missing directories", () => {
  assert.deepEqual(listTestFiles(FIXTURE_APP, ["test", "no-such-dir"]), ["test/sample.test.js"]);
});

test("repeat counts failures per test over N runs", async (t) => {
  t.after(() => delete process.env.REPEAT_FIXTURE_FAIL_ON);
  process.env.REPEAT_FIXTURE_FAIL_ON = "2,4";
  const report = await repeat({ runs: 4, app: FIXTURE_APP });
  assert.deepEqual(report.redRuns, [2, 4]);
  const byName = Object.fromEntries(report.tests.map((x) => [x.name, x.failures]));
  assert.deepEqual(byName, { "fails on the chosen runs": 2, "always green": 0, "a group › nested and green": 0 });
  assert.match(report.tests[0].messages[0], /run 2 is on the list/);
  const text = formatRepeat(report);
  assert.match(text, /Червоних прогонів: 2 з 4 \(№ 2, 4\)/);
  assert.match(text, /fails on the chosen runs +2\/4/);
});

test("two tests with the same name in different files are counted apart", async (t) => {
  t.after(() => delete process.env.REPEAT_FIXTURE_FAIL_ON);
  process.env.REPEAT_FIXTURE_FAIL_ON = "1,3";
  const report = await repeat({ runs: 3, app: DUP_APP });
  assert.deepEqual(
    report.tests.map((x) => [x.file, x.name, x.runs, x.failures]),
    [
      ["test/a.test.js", "same name in two files", 3, 2],
      ["test/b.test.js", "same name in two files", 3, 0],
    ],
  );
  assert.deepEqual(report.redRuns, [1, 3]);
  const text = formatRepeat(report, { all: true });
  assert.match(text, /файлів 2, тестів 2/);
  assert.match(text, /test\/a\.test\.js\n {2}same name in two files +2\/3/);
  assert.match(text, /test\/b\.test\.js\n {2}same name in two files +0\/3/);
});

test("the CLI exits 0 when every run is green and 1 when any test failed", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const green = spawnSync(process.execPath, [TOOL, "3", "--app", FIXTURE_APP], { encoding: "utf8", env });
  assert.equal(green.status, 0);
  assert.match(green.stdout, /Червоних прогонів: 0 з 3/);

  const red = spawnSync(process.execPath, [TOOL, "3", "--app", FIXTURE_APP], {
    encoding: "utf8",
    env: { ...env, REPEAT_FIXTURE_FAIL_ON: "3" },
  });
  assert.equal(red.status, 1);
  assert.match(red.stdout, /fails on the chosen runs +1\/3/);
});
