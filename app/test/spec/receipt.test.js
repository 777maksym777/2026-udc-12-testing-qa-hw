// Spec tests for T9 (amounts, rounding and the receipt format).
// Expected values: docs/test-cases.md TC-29..TC-30 and docs/spec/tariffs.md:127-137.
// The per-line vs per-total rounding question (Q-4) is not automated.

import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../../src/tariff.js";
import { formatReceipt } from "../../src/receipt.js";

const ride = (pickupAt, returnAt, extra = {}) =>
  ({ pickupAt, returnAt, bike: "classic", returnStation: "S03", ...extra });

test("T9: the receipt for a 25-hour ride (TC-27) shows «До сплати» as 2 300,00 грн (TC-29)", () => {
  const result = quote(
    ride("2026-09-16T07:00:00+03:00", "2026-09-17T08:00:00+03:00"),
    { type: "standard" },
  );
  const lines = formatReceipt(result);
  const last = lines.at(-1);
  assert.ok(last.startsWith("До сплати"), `the last line must be «До сплати», got: ${last}`);
  // comma as the decimal separator, space as the thousands separator
  assert.ok(last.includes("2 300,00 грн"), `expected «2 300,00 грн» in: ${last}`);
});

test("T9: a receipt with a discount and a fee (TC-19 ride) itemises every line (TC-30)", () => {
  const result = quote(
    ride("2026-09-16T10:00:00+03:00", "2026-09-16T10:20:00+03:00", { returnStation: "X01" }),
    { type: "reduced" },
  );
  assert.ok(result.discounts.length >= 1, "the ride must carry a discount");
  assert.ok(result.fees.length >= 1, "the ride must carry a fee");

  const lines = formatReceipt(result);
  // duration of the ride (20 min per T1)
  assert.ok(lines[0].includes("20 хв"), `expected the duration line first, got: ${lines[0]}`);
  // the T3 time-charge line: 1 block of a classic bike = 25 грн (spec T3)
  assert.ok(lines[1].includes("25,00 грн"), `expected the T3 charge 25,00 грн, got: ${lines[1]}`);
  // a separate line per discount, each with a minus sign
  const minusLines = lines.filter((line) => /-\d[\d ]*,\d{2} грн$/.test(line));
  assert.equal(minusLines.length, result.discounts.length);
  // a separate line per fee and the final «До сплати» line:
  // duration + time charge + discounts + fees + total
  assert.equal(lines.length, 2 + result.discounts.length + result.fees.length + 1);
  assert.ok(lines.at(-1).startsWith("До сплати"), `the last line must be «До сплати», got: ${lines.at(-1)}`);
});
