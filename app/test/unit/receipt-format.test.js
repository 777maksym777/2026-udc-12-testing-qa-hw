import test from "node:test";
import assert from "node:assert/strict";
import { formatReceipt, formatUah } from "../../src/receipt.js";

test("amounts are shown in hryvnias", () => {
  assert.equal(formatUah(5000), "50,00 грн");
  assert.equal(formatUah(230000), "2 300,00 грн");
  assert.equal(formatUah(-1250), "-12,50 грн");
});

test("a receipt has a line for every item", () => {
  const lines = formatReceipt({
    minutes: 40,
    timeCharge: 5000,
    discounts: [{ code: "night", amount: 1500 }],
    fees: [{ code: "out-of-zone", amount: 15000 }],
    total: 18500,
  });
  assert.equal(lines.length, 5);
  assert.ok(lines.at(-1).includes("185,00"));
});
