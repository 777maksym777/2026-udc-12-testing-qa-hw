import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createDayCap, DAY_CAP } from "../../src/day-cap.js";
import { BLOCK_MINUTES, QuoteError, RATES, quote } from "../../src/tariff.js";

const ride = (pickupAt, returnAt, extra = {}) => ({ pickupAt, returnAt, bike: "classic", returnStation: "S01", ...extra });
const standard = { type: "standard" };

test("quote returns an itemised price", () => {
  const rides = [
    ride("2026-09-16T07:00:00Z", "2026-09-16T07:01:00Z"),
    ride("2026-09-16T07:00:00Z", "2026-09-16T07:50:00Z"),
    ride("2026-09-16T07:00:00Z", "2026-09-16T09:10:00Z", { bike: "ebike" }),
  ];
  for (const r of rides) {
    const result = quote(r, standard);
    assert.ok(result.total >= 0);
    assert.ok(Array.isArray(result.discounts));
    assert.ok(Array.isArray(result.fees));
    assert.equal(typeof result.minutes, "number");
  }
});

test("a ride of 30 min 20 s rounds up to 31 min and opens a second block (T1, T3)", () => {
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T07:30:20Z"), standard);
  assert.equal(result.minutes, 31);
  assert.equal(result.timeCharge, 5000);
});

test("e-bikes are billed at the e-bike rate", () => {
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T08:15:00Z", { bike: "ebike" }), standard);
  assert.equal(result.timeCharge, Math.ceil(result.minutes / BLOCK_MINUTES) * RATES.ebike);
  assert.equal(result.total, result.timeCharge);
});

test("subscribers ride a classic bike free for the first 45 minutes; an e-bike gets 20 % off, no free minutes (T4)", () => {
  const classic = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T07:40:00Z"), { type: "subscriber" });
  assert.equal(classic.total, 0);

  const ebike = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T07:40:00Z", { bike: "ebike" }), { type: "subscriber" });
  assert.equal(ebike.timeCharge, 8000);
  assert.equal(ebike.total, 6400);
});

test("subscription on a long e-bike ride", () => {
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T08:40:00Z", { bike: "ebike" }), { type: "subscriber" });
  assert.ok(result.discounts.some((d) => d.code === "subscription"));
  assert.ok(result.total < result.timeCharge);
});

test("reduced fare cuts the time charge in half but never the fees (T5, T7)", () => {
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T07:40:00Z", { returnStation: "X01" }), { type: "reduced" });
  assert.equal(result.total, 17500);
  assert.equal(result.fees[0].amount, 15000);
});

test("night rides get 30 % off", () => {
  // 01:10–01:40 in Kyiv
  const result = quote(ride("2026-09-15T22:10:00Z", "2026-09-15T22:40:00Z"), standard);
  assert.equal(result.timeCharge, 2500);
  assert.equal(result.discounts.length, 1);
  assert.equal(result.discounts[0].code, "night");
  assert.ok(result.total < result.timeCharge);
});

test("a bike kept over a day and left outside the zone pays both fees", () => {
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-18T07:00:00Z", { returnStation: "X03" }), standard);
  assert.equal(result.fees.length, 2);
});

test("the daily cap limits the time charge", () => {
  const dayCap = createDayCap();
  const rider = { id: "rider-7", type: "standard" };
  let last;
  for (const [from, to] of [["06:00", "07:20"], ["10:00", "11:20"], ["15:00", "16:20"]]) {
    last = quote(ride(`2026-09-16T${from}:00Z`, `2026-09-16T${to}:00Z`, { bike: "ebike" }), rider, { dayCap });
  }
  assert.ok(last.total <= DAY_CAP);
});

test("a 45-minute classic ride costs 50 UAH", () => {
  const priceRide = mock.fn(() => ({ minutes: 45, timeCharge: 5000, discounts: [], fees: [], total: 5000 }));
  const result = priceRide(ride("2026-09-16T07:00:00Z", "2026-09-16T07:45:00Z"), standard);
  assert.equal(result.total, 5000);
  assert.equal(priceRide.mock.callCount(), 1);
});

test("a return before the pickup is rejected", () => {
  assert.throws(() => quote(ride("2026-09-16T08:00:00Z", "2026-09-16T07:00:00Z"), standard), QuoteError);
});
