// Daily cap on time charges (T6): a ledger of what each rider has been charged per day.

export const DAY_CAP = 30000; // kopecks

/** The day a ride is booked on, from its pickup instant. */
export function dayKey(pickupAt) {
  return new Date(pickupAt).toISOString().slice(0, 10);
}

export function createDayCap({ limit = DAY_CAP } = {}) {
  const charged = new Map();
  const keyOf = (riderId, pickupAt) => `${riderId}|${dayKey(pickupAt)}`;

  return {
    limit,
    /** How much time charge the rider can still be billed on the ride's day. */
    remaining(riderId, pickupAt) {
      return Math.max(0, limit - (charged.get(keyOf(riderId, pickupAt)) ?? 0));
    },
    record(riderId, pickupAt, amount) {
      const key = keyOf(riderId, pickupAt);
      charged.set(key, (charged.get(key) ?? 0) + amount);
    },
    chargedOn(riderId, day) {
      return charged.get(`${riderId}|${day}`) ?? 0;
    },
  };
}
