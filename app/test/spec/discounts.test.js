// Spec tests for T4 (subscription), T5 (reduced fare) and T10 (night discount).
// Expected values: docs/test-cases.md TC-11..TC-19, TC-31..TC-33 and docs/spec/tariffs.md.
// Defaults per docs/test-cases.md: classic bike, in-zone return (S03), daytime in Kyiv
// (September 2026 = UTC+3). Discount-combination cases from «Питання до специфікації»
// (Q-1, Q-2) are intentionally not automated.

import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../../src/tariff.js";
import { formatReceipt } from "../../src/receipt.js";

const ride = (pickupAt, returnAt, extra = {}) =>
  ({ pickupAt, returnAt, bike: "classic", returnStation: "S03", ...extra });

const cases = [
  // T4 — subscription (docs/spec/tariffs.md:74-82)
  {
    name: "T4: subscriber, classic, 40 min — within 45 free minutes → 0 (TC-11)",
    rider: { type: "subscriber" },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:40:00+03:00",
    total: 0,
  },
  {
    name: "T4: subscriber, classic, exactly 45 min → 0 (TC-12)",
    rider: { type: "subscriber" },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:45:00+03:00",
    total: 0,
  },
  {
    name: "T4: subscriber, classic, 46 min — 1 paid minute from the 46th → 1 block → 2500 (TC-13)",
    rider: { type: "subscriber" },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:46:00+03:00",
    total: 2500,
  },
  {
    name: "T4: subscriber, classic, 100 min — 55 paid minutes → 2 blocks → 5000 (TC-14)",
    rider: { type: "subscriber" },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T11:40:00+03:00",
    total: 5000,
  },
  {
    name: "T4: subscriber, e-bike, 60 min — 2 blocks = 8000 − 20 %, no free minutes → 6400 (TC-15)",
    rider: { type: "subscriber" },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T11:00:00+03:00",
    extra: { bike: "ebike" },
    total: 6400,
  },
  // T5 — reduced fare (docs/spec/tariffs.md:86-96)
  {
    name: "T5: reduced, classic, 40 min — 2 blocks = 5000 − 50 % → 2500 (TC-16)",
    rider: { type: "reduced" },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:40:00+03:00",
    total: 2500,
  },
  {
    name: "T5: subscriber with concession, classic, 80 min — the cheaper reduced fare wins: 7500 − 50 % → 3750 (TC-17)",
    rider: { type: "subscriber", concession: true },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T11:20:00+03:00",
    total: 3750,
  },
  {
    name: "T5: reduced, classic, 20 min, returned out of zone — the fee is NOT discounted: 1250 + 15000 → 16250 (TC-19)",
    rider: { type: "reduced" },
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:20:00+03:00",
    extra: { returnStation: "X01" },
    total: 16250,
  },
  // T10 — night discount, window 00:00–06:00 Kyiv (docs/spec/tariffs.md:141-143)
  {
    name: "T10: pickup 01:10, return 01:40 Kyiv — 2500 − 30 % → 1750 (TC-31)",
    rider: { type: "standard" },
    pickupAt: "2026-09-16T01:10:00+03:00", returnAt: "2026-09-16T01:40:00+03:00",
    total: 1750,
  },
  {
    name: "T10: pickup exactly at 00:00 is inside the window → 1750 (TC-32)",
    rider: { type: "standard" },
    pickupAt: "2026-09-16T00:00:00+03:00", returnAt: "2026-09-16T00:30:00+03:00",
    total: 1750,
  },
  {
    name: "T10: pickup exactly at 06:00 is outside the window → 2500 (TC-33)",
    rider: { type: "standard" },
    pickupAt: "2026-09-16T06:00:00+03:00", returnAt: "2026-09-16T06:30:00+03:00",
    total: 2500,
  },
];

for (const c of cases) {
  test(c.name, () => {
    const result = quote(ride(c.pickupAt, c.returnAt, c.extra), c.rider);
    assert.equal(result.total, c.total);
  });
}

// TC-18 also checks which discount the receipt names, so it is a separate test.
test("T5: equal subscription and reduced charges — the subscription applies: 2500, the receipt says «абонемент» (TC-18)", () => {
  const result = quote(
    ride("2026-09-16T10:00:00+03:00", "2026-09-16T11:00:00+03:00"),
    { type: "subscriber", concession: true },
  );
  assert.equal(result.total, 2500);
  const receipt = formatReceipt(result);
  assert.ok(
    receipt.some((line) => line.includes("абонемент")),
    `expected a receipt line naming the subscription discount, got:\n${receipt.join("\n")}`,
  );
});
