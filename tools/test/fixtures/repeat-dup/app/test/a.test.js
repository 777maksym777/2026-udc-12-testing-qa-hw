// Fixture for tools/test/repeat.test.mjs: the same test name as in b.test.js; this one
// fails on the runs listed in REPEAT_FIXTURE_FAIL_ON.
import test from "node:test";
import assert from "node:assert/strict";

test("same name in two files", () => {
  const chosen = (process.env.REPEAT_FIXTURE_FAIL_ON ?? "").split(",").filter(Boolean);
  assert.equal(chosen.includes(process.env.REPEAT_RUN), false, `a: run ${process.env.REPEAT_RUN} is on the list`);
});
