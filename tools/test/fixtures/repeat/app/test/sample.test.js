// Fixture for tools/test/repeat.test.mjs: one test fails on the runs listed in
// REPEAT_FIXTURE_FAIL_ON (e.g. "2,4"); tools/repeat.mjs sets REPEAT_RUN for every run.
import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

test("always green", () => {
  assert.ok(true);
});

test("fails on the chosen runs", () => {
  const chosen = (process.env.REPEAT_FIXTURE_FAIL_ON ?? "").split(",").filter(Boolean);
  assert.equal(chosen.includes(process.env.REPEAT_RUN), false, `run ${process.env.REPEAT_RUN} is on the list`);
});

describe("a group", () => {
  it("nested and green", () => {});
});
