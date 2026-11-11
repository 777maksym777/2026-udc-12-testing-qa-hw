// Spec tests for T6 (daily cap on time charges, per Kyiv calendar day).
// Expected values: docs/test-cases.md TC-20..TC-23 and docs/spec/tariffs.md:100-107.
// Defaults per docs/test-cases.md: classic bike, in-zone return (S03); Kyiv time in
// September 2026 = UTC+3.

import test from "node:test";
import assert from "node:assert/strict";
import { createDayCap } from "../../src/day-cap.js";
import { quote } from "../../src/tariff.js";

const ride = (pickupAt, returnAt, extra = {}) =>
  ({ pickupAt, returnAt, bike: "classic", returnStation: "S03", ...extra });

/** A ledger where the rider has already been charged the full 300 UAH on 16.09
 *  (noon Kyiv pickup = 09:00Z, so the booking day is 2026-09-16 in any reading). */
function exhaustedOn16th(riderId) {
  const dayCap = createDayCap();
  dayCap.record(riderId, Date.parse("2026-09-16T12:00:00+03:00"), 30000);
  return dayCap;
}

test("T6: three 80-min e-bike rides on 16.09 — 12000, 12000, then capped 6000 (TC-20)", () => {
  const dayCap = createDayCap();
  const rider = { id: "rider-20", type: "standard" };
  const totals = [];
  for (const [from, to] of [["09:00", "10:20"], ["13:00", "14:20"], ["18:00", "19:20"]]) {
    const r = ride(`2026-09-16T${from}:00+03:00`, `2026-09-16T${to}:00+03:00`, { bike: "ebike" });
    totals.push(quote(r, rider, { dayCap }).total);
  }
  assert.deepEqual(totals, [12000, 12000, 6000]);
});

test("T6: pickup 16.09 23:40, return 17.09 00:20 belongs to 16.09 — cap spent → charge 0 (TC-21)", () => {
  const rider = { id: "rider-21", type: "standard" };
  const result = quote(
    ride("2026-09-16T23:40:00+03:00", "2026-09-17T00:20:00+03:00"),
    rider,
    { dayCap: exhaustedOn16th(rider.id) },
  );
  assert.equal(result.total, 0);
});

test("T6: a new day starts at Kyiv midnight — pickup 17.09 00:30 Kyiv (16.09 21:30Z) is charged: 2500 − 30 % (T10) → 1750 (TC-22)", () => {
  const rider = { id: "rider-22", type: "standard" };
  const result = quote(
    ride("2026-09-17T00:30:00+03:00", "2026-09-17T01:00:00+03:00"),
    rider,
    { dayCap: exhaustedOn16th(rider.id) },
  );
  assert.equal(result.total, 1750);
});

test("T6: fees are not capped — cap spent, 20-min ride returned on X01 → 0 + 15000 (TC-23)", () => {
  const rider = { id: "rider-23", type: "standard" };
  const result = quote(
    ride("2026-09-16T20:00:00+03:00", "2026-09-16T20:20:00+03:00", { returnStation: "X01" }),
    rider,
    { dayCap: exhaustedOn16th(rider.id) },
  );
  assert.equal(result.total, 15000);
});
