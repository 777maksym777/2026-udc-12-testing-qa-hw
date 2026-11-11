// Spec tests for T7 (out-of-zone fee) and T8 (unreturned-bike fee).
// Expected values: docs/test-cases.md TC-24..TC-28 and docs/spec/tariffs.md:109-126.
// Defaults per docs/test-cases.md: classic bike, standard rider, daytime in Kyiv
// (September 2026 = UTC+3).

import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../../src/tariff.js";

const ride = (pickupAt, returnAt, extra = {}) =>
  ({ pickupAt, returnAt, bike: "classic", returnStation: "S03", ...extra });
const standard = { type: "standard" };

const cases = [
  // T7 — out-of-zone return fee 150 UAH (docs/spec/tariffs.md:111-115, додаток А)
  {
    name: "T7: standard, classic, 20 min, returned on X01 — 2500 + 15000 → 17500 (TC-24)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:20:00+03:00",
    extra: { returnStation: "X01" },
    total: 17500,
  },
  {
    name: "T7: the same ride returned on S03 (in zone) — no fee → 2500 (TC-25)",
    pickupAt: "2026-09-16T10:00:00+03:00", returnAt: "2026-09-16T10:20:00+03:00",
    extra: { returnStation: "S03" },
    total: 2500,
  },
  // T8 — unreturned bike: fee only when the ride is over 24 hours (docs/spec/tariffs.md:119-126)
  {
    name: "T8: exactly 24 h (1440 min) is not \"over 24 hours\" — no fee; 48 blocks capped by T6 → 30000 (TC-26)",
    pickupAt: "2026-09-16T07:00:00+03:00", returnAt: "2026-09-17T07:00:00+03:00",
    total: 30000,
  },
  {
    name: "T8: standard, classic, 25 h — capped 30000 + fee 200000 → 230000 (TC-27)",
    pickupAt: "2026-09-16T07:00:00+03:00", returnAt: "2026-09-17T08:00:00+03:00",
    total: 230000,
  },
  {
    name: "T8: 25 h returned on X01 — independent fees: 30000 + 200000 + 15000 → 245000 (TC-28)",
    pickupAt: "2026-09-16T07:00:00+03:00", returnAt: "2026-09-17T08:00:00+03:00",
    extra: { returnStation: "X01" },
    total: 245000,
  },
];

for (const c of cases) {
  test(c.name, () => {
    const result = quote(ride(c.pickupAt, c.returnAt, c.extra), standard);
    assert.equal(result.total, c.total);
  });
}
