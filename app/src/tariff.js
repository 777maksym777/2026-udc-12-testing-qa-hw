// Price of a finished ride, itemised, in kopecks. The rules: docs/spec/tariffs.md.
//
//   quote(ride, rider, { zones, dayCap })
//     ride   { pickupAt, returnAt, bike: "classic" | "ebike", returnStation }
//            pickupAt / returnAt — ISO 8601 date-time with Z or an offset
//     rider  { type: "standard" | "reduced" | "subscriber", concession?: boolean, id? }
//            concession — a subscriber who also has the right to the reduced fare
//     zones  station → zone lookup (src/zones.js)
//     dayCap a ledger from createDayCap() — the ride is checked against and booked into it;
//            rider.id is required then
//   → { minutes, timeCharge, discounts: [{ code, amount }], fees: [{ code, amount }], total }
//     timeCharge is the T3 price; every discount is subtracted from it, every fee added.

import { DAY_CAP } from "./day-cap.js";
import { kyivTime } from "./kyiv-time.js";
import { stationZones } from "./zones.js";

export const RATES = Object.freeze({ classic: 2500, ebike: 4000 });
export const BLOCK_MINUTES = 30;
export const FREE_START_MINUTES = 2;
export const SUBSCRIPTION_FREE_MINUTES = 45;
export const SUBSCRIPTION_EBIKE_PERCENT = 20;
export const REDUCED_PERCENT = 50;
export const NIGHT_PERCENT = 30;
export const NIGHT_UNTIL_HOUR = 6;
export const OUT_OF_ZONE_FEE = 15000;
export const UNRETURNED_FEE = 200000;
export const UNRETURNED_AFTER_MINUTES = 24 * 60;

const RIDER_TYPES = new Set(["standard", "reduced", "subscriber"]);
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export class QuoteError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuoteError";
  }
}

export function quote(ride, rider, { zones = stationZones, dayCap } = {}) {
  const { pickup, minutes, zone } = readRide(ride, zones);
  readRider(rider, dayCap);

  const timeCharge = chargeFor(minutes, ride.bike);
  const discounts = [];
  const plan = cheaperPlan(minutes, ride.bike, rider, timeCharge);
  if (plan.amount > 0) discounts.push({ code: plan.code, amount: plan.amount });
  let due = timeCharge - plan.amount;

  if (due > 0 && kyivTime(pickup).hour < NIGHT_UNTIL_HOUR) {
    const amount = discount(due, NIGHT_PERCENT);
    discounts.push({ code: "night", amount });
    due -= amount;
  }

  const allowance = dayCap ? dayCap.remaining(rider.id, pickup) : DAY_CAP;
  if (due > allowance) {
    discounts.push({ code: "day-cap", amount: due - allowance });
    due = allowance;
  }
  dayCap?.record(rider.id, pickup, due);

  const fees = feesFor(minutes, zone).map((fee) =>
    plan.code === "reduced" ? { code: fee.code, amount: fee.amount - discount(fee.amount, REDUCED_PERCENT) } : fee,
  );
  const total = fees.reduce((sum, fee) => sum + fee.amount, due);
  return { minutes, timeCharge, discounts, fees, total };
}

function rideMinutes(pickup, returned) {
  // T1: a partial minute counts as a full one — round up to whole minutes.
  return Math.ceil((returned - pickup) / 60_000);
}

function blocks(minutes) {
  return Math.ceil(minutes / BLOCK_MINUTES);
}

function chargeFor(minutes, bike) {
  // T2: a ride of not more than 2 minutes carries no time charge.
  if (minutes <= FREE_START_MINUTES) return 0;
  return blocks(minutes) * RATES[bike];
}

function subscriptionCharge(minutes, bike) {
  const charge = blocks(Math.max(0, minutes - SUBSCRIPTION_FREE_MINUTES)) * RATES[bike];
  return bike === "ebike" ? charge - discount(charge, SUBSCRIPTION_EBIKE_PERCENT) : charge;
}

/** The fare discount: subscription or reduced fare, whichever leaves the rider less to pay. */
function cheaperPlan(minutes, bike, rider, timeCharge) {
  const plans = [{ code: "none", amount: 0 }];
  if (rider.type === "subscriber") {
    plans.push({ code: "subscription", amount: timeCharge - subscriptionCharge(minutes, bike) });
  }
  if (rider.type === "reduced" || (rider.type === "subscriber" && rider.concession === true)) {
    plans.push({ code: "reduced", amount: discount(timeCharge, REDUCED_PERCENT) });
  }
  return plans.reduce((best, plan) => (plan.amount > best.amount ? plan : best));
}

/** `percent` % off `amount`; what is left to pay is rounded down to the kopeck (T9). */
export function discount(amount, percent) {
  return amount - Math.floor((amount * (100 - percent)) / 100);
}

function feesFor(minutes, zone) {
  const fees = [];
  if (zone === "out") fees.push({ code: "out-of-zone", amount: OUT_OF_ZONE_FEE });
  if (minutes > UNRETURNED_AFTER_MINUTES) fees.push({ code: "unreturned", amount: UNRETURNED_FEE });
  return fees;
}

function readRide(ride, zones) {
  if (!ride || typeof ride !== "object") throw new QuoteError("ride is required");
  const pickup = instant(ride.pickupAt, "pickupAt");
  const returned = instant(ride.returnAt, "returnAt");
  if (returned < pickup) throw new QuoteError("returnAt is before pickupAt");
  if (!Object.hasOwn(RATES, ride.bike)) throw new QuoteError(`unknown bike type: ${ride.bike}`);
  const zone = zones.zoneOf(ride.returnStation);
  if (!zone) throw new QuoteError(`unknown station: ${ride.returnStation}`);
  return { pickup, minutes: rideMinutes(pickup, returned), zone };
}

function readRider(rider, dayCap) {
  if (!rider || !RIDER_TYPES.has(rider.type)) throw new QuoteError(`unknown rider type: ${rider?.type}`);
  if (dayCap && !rider.id) throw new QuoteError("rider.id is required with a daily cap ledger");
}

function instant(value, field) {
  if (typeof value !== "string" || !ISO_DATE_TIME.test(value)) {
    throw new QuoteError(`${field} must be an ISO 8601 date-time with an offset`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new QuoteError(`${field} is not a valid date-time`);
  return ms;
}
