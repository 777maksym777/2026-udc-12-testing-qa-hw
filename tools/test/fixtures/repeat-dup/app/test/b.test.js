// Fixture for tools/test/repeat.test.mjs: the same test name as in a.test.js, always green.
import test from "node:test";
import assert from "node:assert/strict";

test("same name in two files", () => {
  assert.ok(true);
});
