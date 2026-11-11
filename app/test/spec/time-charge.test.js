// Spec tests for T1 (duration), T2 (false start) and T3 (time charge).
// Expected values: docs/test-cases.md TC-01..TC-10 and docs/spec/tariffs.md.
// Defaults per docs/test-cases.md: classic bike, standard rider, in-zone return (S03),
// daytime in Kyiv (September 2026 = UTC+3, so 10:00+03:00 = 07:00Z).

import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../../src/tariff.js";

const ride = (pickupAt, returnAt, extra = {}) =>
  ({ pickupAt, returnAt, bike: "classic", returnStation: "S03", ...extra });
const standard = { type: "standard" };

const cases = [
  // T1 — duration, partial minutes round up (docs/spec/tariffs.md:46-50)
  {
    name: "T1: 10:00:00–10:12:40 → 13 min → 1 block → 2500 (TC-01)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:12:40+03:00",
    minutes: 13, total: 2500,
  },
  {
    name: "T1: 14:05:00–14:41:00 → 36 min → 2 blocks → 5000 (TC-02)",
    pickupAt: "2026-09-16T14:05:00+03:00", returnAt: "2026-09-16T14:41:00+03:00",
    minutes: 36, total: 5000,
  },
  {
    name: "T1: a partial minute rounds up: 10:00:00–10:30:20 → 31 min → 2 blocks → 5000 (TC-03)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:30:20+03:00",
    minutes: 31, total: 5000,
  },
  // T2 — false start, boundary at 2 minutes (docs/spec/tariffs.md:54-58)
  {
    name: "T2: a 50-second ride → 1 min → no time charge → 0 (TC-04)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:00:50+03:00",
    total: 0,
  },
  {
    name: "T2: exactly 2 min 00 s is \"not more than 2 minutes\" → 0 (TC-05)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:02:00+03:00",
    total: 0,
  },
  {
    name: "T2: 2 min 10 s → 3 min (T1) > 2 min → 1 block → 2500 (TC-06)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:02:10+03:00",
    minutes: 3, total: 2500,
  },
  {
    name: "T2: a 1-minute ride returned out of zone pays the fee: 0 + 15000 (TC-07)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:01:00+03:00",
    extra: { returnStation: "X01" },
    timeCharge: 0, total: 15000,
  },
  // T3 — price per started 30-minute block (docs/spec/tariffs.md:62-70)
  {
    name: "T3: classic, 50 min → 2 blocks × 2500 → 5000 (TC-08)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:50:00+03:00",
    total: 5000,
  },
  {
    name: "T3: e-bike, 75 min → 3 blocks × 4000 → 12000 (TC-09)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T11:15:00+03:00",
    extra: { bike: "ebike" },
    total: 12000,
  },
  {
    name: "T3: exactly 30 min 00 s → 1 block → 2500 (TC-10)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:30:00+03:00",
    minutes: 30, total: 2500,
  },
];

for (const c of cases) {
  test(c.name, () => {
    const result = quote(ride(c.pickupAt, c.returnAt, c.extra), standard);
    if (c.minutes !== undefined) assert.equal(result.minutes, c.minutes);
    if (c.timeCharge !== undefined) assert.equal(result.timeCharge, c.timeCharge);
    assert.equal(result.total, c.total);
  });
}
