// Test data: rides and riders with varied values.

const BIKES = ["classic", "ebike"];
const IN_ZONE = ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08"];

// 21.09.2026, 09:00 in Kyiv (06:00Z): rides start during the day.
const DAY_START = Date.UTC(2026, 8, 21, 6, 0);
const MINUTE = 60_000;

const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function randomRide(overrides = {}) {
  const pickup = DAY_START + between(0, 600) * MINUTE;
  const minutes = between(5, 89);
  return {
    pickupAt: new Date(pickup).toISOString(),
    returnAt: new Date(pickup + minutes * MINUTE).toISOString(),
    bike: pick(BIKES),
    returnStation: pick(IN_ZONE),
    ...overrides,
  };
}

export function randomRides(count, overrides = {}) {
  return Array.from({ length: count }, () => randomRide(overrides));
}

export function randomRider(overrides = {}) {
  return { id: `rider-${between(1000, 9999)}`, type: "standard", ...overrides };
}
