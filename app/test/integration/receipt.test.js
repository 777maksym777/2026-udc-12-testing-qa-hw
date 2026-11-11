// quote() and formatReceipt() together, the way the API uses them.
//
// The ride table is deterministic (no Math.random): the old version drew random
// 5–89-minute rides and recomputed the price with its own formula
// `Math.floor(minutes / 30) + 1`, which over-counts a block exactly when the
// duration is a multiple of 30 — so the test failed only when the generator
// happened to land on 30 or 60 minutes (see docs/triage.md, розділ 1).
// Expected totals below are literals from the spec (T3: 25/40 грн per started
// 30-minute block), with both sides of every block boundary in the table.
import test from "node:test";
import assert from "node:assert/strict";
import { formatReceipt } from "../../src/receipt.js";
import { quote } from "../../src/tariff.js";

const uah = (kopecks) => `${(kopecks / 100).toFixed(2).replace(".", ",")} грн`;

// 2026-09-21, daytime in Kyiv (UTC+3), in-zone return: no night discount, no fees.
const PICKUP_AT = "2026-09-21T09:00:00+03:00";
const rideOf = (minutes, bike) => ({
  pickupAt: PICKUP_AT,
  returnAt: new Date(Date.parse(PICKUP_AT) + minutes * 60_000).toISOString(),
  bike,
  returnStation: "S03",
});

test("every receipt of a week of rides ends with the amount due (T3 blocks, both sides of each boundary)", () => {
  const rider = { id: "rider-week", type: "standard" };
  const week = [
    // [bike, minutes, expected total in kopecks — from the spec, not recomputed]
    ["classic", 5, 2500],
    ["classic", 29, 2500],
    ["classic", 30, 2500], // exactly one block (the case the random data used to trip on)
    ["classic", 31, 5000],
    ["classic", 60, 5000], // exactly two blocks
    ["classic", 61, 7500],
    ["ebike", 30, 4000],
    ["ebike", 60, 8000],
    ["ebike", 75, 12000],
    ["ebike", 89, 12000],
  ];

  for (const [bike, minutes, expected] of week) {
    const lines = formatReceipt(quote(rideOf(minutes, bike), rider));

    assert.ok(lines.at(-1).startsWith("До сплати "));
    assert.ok(
      lines.at(-1).endsWith(` ${uah(expected)}`),
      `${bike}, ${minutes} min: got "${lines.at(-1)}", expected ${uah(expected)}`,
    );
  }
});

test("a receipt lists the fee for a return outside the zone", () => {
  const ride = {
    pickupAt: "2026-09-21T07:15:00Z",
    returnAt: "2026-09-21T07:35:00Z",
    bike: "classic",
    returnStation: "X02",
  };

  const lines = formatReceipt(quote(ride, { id: "rider-x02", type: "standard" }));

  assert.deepEqual(lines, [
    "Тривалість поїздки: 20 хв",
    "Погодинне нарахування .............. 25,00 грн",
    "Збір: повернення поза зоною ....... 150,00 грн",
    "До сплати ......................... 175,00 грн",
  ]);
});
