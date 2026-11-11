import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createDayCap, DAY_CAP } from "../../src/day-cap.js";
import { BLOCK_MINUTES, discount, QuoteError, RATES, quote } from "../../src/tariff.js";

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

// ---- tests added for Task C: each one kills a mutant that survived the first run ----

test("T1: milliseconds over a whole minute open the next minute", () => {
  // 30 min 0.030 s → 31 minutes → a second block (kills M030: 60_000 → 60001)
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T07:30:00.030Z"), standard);
  assert.equal(result.minutes, 31);
  assert.equal(result.timeCharge, 5000);
});

test("T8: 24 h 01 min is already \"over 24 hours\" — the unreturned fee applies", () => {
  // kills M014 (24 * 60 → 24 * 61): the boundary sits at exactly 1440 minutes
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-17T07:01:00Z"), standard);
  assert.equal(result.minutes, 1441);
  assert.deepEqual(result.fees, [{ code: "unreturned", amount: 200000 }]);
  assert.equal(result.total, 230000);
});

test("T6: the day-cap discount is exactly what is over the cap", () => {
  // 25 h classic: timeCharge 125000, capped at 30000 → discount 95000 (kills M024: due - allowance → due + allowance)
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-17T08:00:00Z"), standard);
  assert.equal(result.timeCharge, 125000);
  assert.deepEqual(result.discounts, [{ code: "day-cap", amount: 95000 }]);
  assert.equal(result.total, 230000);
});

test("T6: a charge that lands exactly on the cap gets no day-cap line", () => {
  // 6 h → 12 blocks → exactly 30000 (kills M023: due > allowance → due >= allowance)
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T13:00:00Z"), standard);
  assert.equal(result.timeCharge, DAY_CAP);
  assert.deepEqual(result.discounts, []);
  assert.equal(result.total, DAY_CAP);
});

test("T10: a free night ride gets no zero-amount night line", () => {
  // 01:30–01:31 Kyiv, false start → nothing due, no discounts at all (kills M018: due > 0 → due >= 0)
  const result = quote(ride("2026-09-15T22:30:00Z", "2026-09-15T22:31:00Z"), standard);
  assert.equal(result.total, 0);
  assert.deepEqual(result.discounts, []);
});

test("T9: the payable remainder is rounded DOWN to the kopeck", () => {
  // kills M054/M055 (Math.floor → Math.ceil / Math.round): needs a fractional remainder
  assert.equal(discount(1001, 30), 301); // pay floor(700.7) = 700
  assert.equal(discount(3, 50), 2); // pay floor(1.5) = 1
  assert.equal(discount(2500, 30), 750); // an exact division stays exact
});

test("a ride that is not an object is rejected with QuoteError, not a crash", () => {
  // kills M064 (|| → && in readRide): quote(null) must not reach ride.pickupAt
  assert.throws(
    () => quote(null, standard),
    (error) => error instanceof QuoteError && error.message === "ride is required",
  );
});

test("a zero-duration ride (return at the pickup instant) is allowed and free — current behaviour, Q-3", () => {
  // kills M066 (returned < pickup → <=): pins the boundary at strict inequality
  const result = quote(ride("2026-09-16T07:00:00Z", "2026-09-16T07:00:00Z"), standard);
  assert.equal(result.minutes, 0);
  assert.equal(result.total, 0);
});

test("an instant without a time-zone offset is rejected even though it is a string", () => {
  // kills M075 (|| → && in instant): a parseable local-time string must still be refused
  assert.throws(
    () => quote(ride("2026-09-16T10:00:00", "2026-09-16T10:20:00+03:00"), standard),
    (error) => error instanceof QuoteError && error.message === "pickupAt must be an ISO 8601 date-time with an offset",
  );
  assert.throws(
    () => quote(ride("2026-09-16T10:00:00+03:00", "2026-09-16 10:20:00"), standard),
    (error) => error instanceof QuoteError && error.message === "returnAt must be an ISO 8601 date-time with an offset",
  );
});
