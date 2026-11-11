import test from "node:test";
import assert from "node:assert/strict";
import { createDayCap, DAY_CAP, dayKey } from "../../src/day-cap.js";

test("charges recorded for a day reduce what is left of the cap", () => {
  const ledger = createDayCap();
  ledger.record("rider-1", "2026-09-16T08:00:00Z", 12000);
  assert.equal(ledger.remaining("rider-1", "2026-09-16T12:00:00Z"), DAY_CAP - 12000);
});

test("a rider without recorded charges has the whole cap left", () => {
  // kills M080 (?? 0 → ?? 1 in remaining): the empty ledger must count as zero charged
  const ledger = createDayCap();
  assert.equal(ledger.remaining("rider-new", "2026-09-16T08:00:00Z"), DAY_CAP);
});

test("chargedOn sums the day's records and is 0 for a day without rides", () => {
  // kills M083 (?? 0 → ?? 1 in chargedOn)
  const ledger = createDayCap();
  assert.equal(ledger.chargedOn("rider-1", "2026-09-16"), 0);
  ledger.record("rider-1", "2026-09-16T08:00:00Z", 12000);
  ledger.record("rider-1", "2026-09-16T15:00:00Z", 5000);
  assert.equal(ledger.chargedOn("rider-1", "2026-09-16"), 17000);
  assert.equal(ledger.chargedOn("rider-1", "2026-09-17"), 0);
});

test("the day of a ride is the date of its pickup", () => {
  assert.equal(dayKey("2026-09-16T08:00:00Z"), "2026-09-16");
});
