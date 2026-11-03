import test from "node:test";
import assert from "node:assert/strict";
import { countdown, isAdult, total } from "../../src/calc.js";

test("adults and children", () => {
  assert.equal(isAdult(30), true);
  assert.equal(isAdult(10), false);
});

test("total", () => {
  assert.equal(total(2, 3), 6);
});

test("countdown", () => {
  assert.equal(countdown(3), 3);
});
