// Unit-тести для app/src/tariff.js (B1: написані за кодом, без npm-залежностей).
// Запуск із кореня теки: node --test "ai-runs/b1-from-code/*.test.js"
// Усі суми — в копійках.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { quote, discount, QuoteError, RATES, OUT_OF_ZONE_FEE, UNRETURNED_FEE } from "../../app/src/tariff.js";
import { createDayCap, DAY_CAP } from "../../app/src/day-cap.js";

/** Поїздка за замовчуванням: класичний велосипед, повернення на станцію в зоні (S01). */
const ride = (pickupAt, returnAt, extra = {}) => ({
  pickupAt,
  returnAt,
  bike: "classic",
  returnStation: "S01",
  ...extra,
});

const standard = { type: "standard" };

describe("плата за час (T3): блоки по 30 хв", () => {
  it("поїздка коротша за 2 хв — безплатний старт, total 0", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z"), standard);
    assert.deepEqual(q, { minutes: 1, timeCharge: 0, discounts: [], fees: [], total: 0 });
  });

  it("повернення тієї ж миті — 0 хв, total 0 (returnAt == pickupAt дозволено)", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:00:00Z"), standard);
    assert.equal(q.minutes, 0);
    assert.equal(q.total, 0);
  });

  it("хвилини округлюються: 89 с → 1 хв (безплатно), 91 с → 2 хв (один блок)", () => {
    const free = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:01:29Z"), standard);
    assert.equal(free.minutes, 1);
    assert.equal(free.total, 0);

    const paid = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:01:31Z"), standard);
    assert.equal(paid.minutes, 2);
    assert.equal(paid.total, RATES.classic);
  });

  it("рівно 2 хв — уже платно, один блок", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:02:00Z"), standard);
    assert.equal(q.timeCharge, 2500);
    assert.equal(q.total, 2500);
  });

  it("30 хв на класичному — один блок, 2500", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z"), standard);
    assert.deepEqual(q, { minutes: 30, timeCharge: 2500, discounts: [], fees: [], total: 2500 });
  });

  it("31 хв — початий другий блок оплачується повністю, 5000", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:31:00Z"), standard);
    assert.equal(q.timeCharge, 5000);
    assert.equal(q.total, 5000);
  });

  it("електровелосипед тарифікується по 4000 за блок", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:31:00Z", { bike: "ebike" }), standard);
    assert.equal(q.timeCharge, 2 * RATES.ebike);
    assert.equal(q.total, 8000);
  });

  it("приймає ISO з секундами, частками секунди та офсетом", () => {
    const q = quote(ride("2026-11-10T10:00:00.250+02:00", "2026-11-10T10:31:00+02:00"), standard);
    assert.equal(q.minutes, 31);
    assert.equal(q.timeCharge, 5000);
  });
});

describe("тарифні плани: абонемент і пільговий тариф", () => {
  it("абонементу перші 45 хв безплатні: 40 хв → знижка на весь timeCharge, total 0", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:40:00Z"), { type: "subscriber" });
    assert.equal(q.timeCharge, 5000);
    assert.deepEqual(q.discounts, [{ code: "subscription", amount: 5000 }]);
    assert.equal(q.total, 0);
  });

  it("абонемент, класичний, 75 хв: платний лише блок понад 45 хв → 2500", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T11:15:00Z"), { type: "subscriber" });
    assert.equal(q.timeCharge, 7500);
    assert.deepEqual(q.discounts, [{ code: "subscription", amount: 5000 }]);
    assert.equal(q.total, 2500);
  });

  it("абонемент, електро, 75 хв: блок понад 45 хв зі знижкою 20% → 3200", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T11:15:00Z", { bike: "ebike" }), { type: "subscriber" });
    assert.equal(q.timeCharge, 12000);
    assert.deepEqual(q.discounts, [{ code: "subscription", amount: 8800 }]);
    assert.equal(q.total, 3200);
  });

  it("пільговий тариф: 50% від плати за час", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z"), { type: "reduced" });
    assert.deepEqual(q.discounts, [{ code: "reduced", amount: 1250 }]);
    assert.equal(q.total, 1250);
  });

  it("абонемент із пільгою (concession): коротка поїздка — вигідніший абонемент", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z"), { type: "subscriber", concession: true });
    assert.deepEqual(q.discounts, [{ code: "subscription", amount: 2500 }]);
    assert.equal(q.total, 0);
  });

  it("абонемент із пільгою: довга поїздка (300 хв) — вигідніша пільга 50%", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T15:00:00Z"), { type: "subscriber", concession: true });
    assert.equal(q.timeCharge, 25000); // 10 блоків; абонемент зекономив би лише 2500
    assert.deepEqual(q.discounts, [{ code: "reduced", amount: 12500 }]);
    assert.equal(q.total, 12500);
  });

  it("безплатна поїздка абонента — без запису про знижку (amount 0 не додається)", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z"), { type: "subscriber" });
    assert.deepEqual(q.discounts, []);
    assert.equal(q.total, 0);
  });
});

describe("нічна знижка: початок до 06:00 за Києвом", () => {
  it("старт о 03:00 за Києвом — мінус 30% від належного", () => {
    const q = quote(ride("2026-11-10T03:00:00+02:00", "2026-11-10T03:30:00+02:00"), standard);
    assert.deepEqual(q.discounts, [{ code: "night", amount: 750 }]);
    assert.equal(q.total, 1750);
  });

  it("старт о 05:59 — ще ніч; о 06:00 — вже ні", () => {
    const night = quote(ride("2026-11-10T05:59:00+02:00", "2026-11-10T06:29:00+02:00"), standard);
    assert.deepEqual(night.discounts, [{ code: "night", amount: 750 }]);

    const day = quote(ride("2026-11-10T06:00:00+02:00", "2026-11-10T06:30:00+02:00"), standard);
    assert.deepEqual(day.discounts, []);
    assert.equal(day.total, 2500);
  });

  it("київська година береться з моменту в часі: 01:00Z у листопаді = 03:00 за Києвом", () => {
    const q = quote(ride("2026-11-10T01:00:00Z", "2026-11-10T01:30:00Z"), standard);
    assert.deepEqual(q.discounts, [{ code: "night", amount: 750 }]);
  });

  it("нічна знижка рахується вже після тарифного плану (від залишку)", () => {
    // reduced: 2500 → 1250; ніч: discount(1250, 30) = 375 → до сплати 875
    const q = quote(ride("2026-11-10T03:00:00+02:00", "2026-11-10T03:30:00+02:00"), { type: "reduced" });
    assert.deepEqual(q.discounts, [
      { code: "reduced", amount: 1250 },
      { code: "night", amount: 375 },
    ]);
    assert.equal(q.total, 875);
  });

  it("якщо після плану належить 0 — нічна знижка не додається", () => {
    const q = quote(ride("2026-11-10T03:00:00+02:00", "2026-11-10T03:40:00+02:00"), { type: "subscriber" });
    assert.deepEqual(q.discounts, [{ code: "subscription", amount: 5000 }]);
    assert.equal(q.total, 0);
  });
});

describe("денний ліміт (T6)", () => {
  it("без леджера плата за час обрізається до DAY_CAP = 30000", () => {
    // 720 хв = 24 блоки = 60000
    const q = quote(ride("2026-11-10T08:00:00Z", "2026-11-10T20:00:00Z"), standard);
    assert.equal(q.timeCharge, 60000);
    assert.deepEqual(q.discounts, [{ code: "day-cap", amount: 30000 }]);
    assert.equal(q.total, DAY_CAP);
  });

  it("нічна знижка застосовується перед лімітом", () => {
    // 60000 → ніч -18000 → 42000 → ліміт -12000 → 30000
    const q = quote(ride("2026-11-10T03:00:00+02:00", "2026-11-10T15:00:00+02:00"), standard);
    assert.deepEqual(q.discounts, [
      { code: "night", amount: 18000 },
      { code: "day-cap", amount: 12000 },
    ]);
    assert.equal(q.total, 30000);
  });

  it("з леджером: поїздка бронюється, і залишок дня вичерпується", () => {
    const cap = createDayCap();
    const rider = { type: "standard", id: "r-1" };

    const first = quote(ride("2026-11-10T08:00:00Z", "2026-11-10T20:00:00Z"), rider, { dayCap: cap });
    assert.equal(first.total, 30000);
    assert.equal(cap.chargedOn("r-1", "2026-11-10"), 30000);

    const second = quote(ride("2026-11-10T21:00:00Z", "2026-11-10T21:30:00Z"), rider, { dayCap: cap });
    assert.deepEqual(second.discounts, [{ code: "day-cap", amount: 2500 }]);
    assert.equal(second.total, 0);
  });

  it("з леджером: наступного дня ліміт знову повний", () => {
    const cap = createDayCap();
    const rider = { type: "standard", id: "r-1" };
    quote(ride("2026-11-10T08:00:00Z", "2026-11-10T20:00:00Z"), rider, { dayCap: cap });

    const nextDay = quote(ride("2026-11-11T10:00:00Z", "2026-11-11T10:30:00Z"), rider, { dayCap: cap });
    assert.deepEqual(nextDay.discounts, []);
    assert.equal(nextDay.total, 2500);
  });

  it("леджер із власним лімітом: друга поїздка обрізається до залишку", () => {
    const cap = createDayCap({ limit: 4000 });
    const rider = { type: "standard", id: "r-2" };

    const first = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z"), rider, { dayCap: cap });
    assert.equal(first.total, 2500);

    const second = quote(ride("2026-11-10T12:00:00Z", "2026-11-10T12:30:00Z"), rider, { dayCap: cap });
    assert.deepEqual(second.discounts, [{ code: "day-cap", amount: 1000 }]);
    assert.equal(second.total, 1500);
    assert.equal(cap.chargedOn("r-2", "2026-11-10"), 4000);
  });
});

describe("збори (fees)", () => {
  it("повернення поза зоною (X01) — збір 15000 понад плату за час", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z", { returnStation: "X01" }), standard);
    assert.deepEqual(q.fees, [{ code: "out-of-zone", amount: OUT_OF_ZONE_FEE }]);
    assert.equal(q.total, 2500 + 15000);
  });

  it("поїздка довша за 24 год — збір за неповернення; ліміт збори не обрізає", () => {
    // 1441 хв: 49 блоків = 122500 → ліміт 30000; + 200000 збору
    const q = quote(ride("2026-11-09T10:00:00Z", "2026-11-10T10:01:00Z"), standard);
    assert.deepEqual(q.discounts, [{ code: "day-cap", amount: 92500 }]);
    assert.deepEqual(q.fees, [{ code: "unreturned", amount: UNRETURNED_FEE }]);
    assert.equal(q.total, 30000 + 200000);
  });

  it("рівно 24 год (1440 хв) — збору за неповернення ще немає", () => {
    const q = quote(ride("2026-11-09T10:00:00Z", "2026-11-10T10:00:00Z"), standard);
    assert.deepEqual(q.fees, []);
    assert.equal(q.total, 30000); // 120000, обрізано лімітом
  });

  it("пільговий план зменшує збори на 50%", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z", { returnStation: "X01" }), {
      type: "reduced",
    });
    assert.deepEqual(q.fees, [{ code: "out-of-zone", amount: 7500 }]);
    assert.equal(q.total, 1250 + 7500);
  });

  it("якщо в абонента з пільгою переміг план «subscription» — збір без знижки", () => {
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z", { returnStation: "X01" }), {
      type: "subscriber",
      concession: true,
    });
    assert.deepEqual(q.discounts, [{ code: "subscription", amount: 2500 }]);
    assert.deepEqual(q.fees, [{ code: "out-of-zone", amount: 15000 }]);
    assert.equal(q.total, 15000);
  });

  it("зони можна підмінити через опцію zones", () => {
    const zones = { zoneOf: (id) => (id === "DEPOT" ? "out" : null) };
    const q = quote(ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z", { returnStation: "DEPOT" }), standard, {
      zones,
    });
    assert.deepEqual(q.fees, [{ code: "out-of-zone", amount: 15000 }]);
    assert.equal(q.total, 17500);
  });
});

describe("валідація вхідних даних (QuoteError)", () => {
  const goodRide = () => ride("2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z");

  it("без ride — помилка", () => {
    assert.throws(() => quote(null, standard), { name: "QuoteError", message: /ride is required/ });
  });

  it("pickupAt без офсета/Z — помилка формату", () => {
    assert.throws(() => quote(ride("2026-11-10T10:00:00", "2026-11-10T10:30:00Z"), standard), {
      name: "QuoteError",
      message: /pickupAt/,
    });
  });

  it("returnAt не рядок ISO — помилка з назвою поля", () => {
    assert.throws(() => quote(ride("2026-11-10T10:00:00Z", 1762768800000), standard), {
      name: "QuoteError",
      message: /returnAt/,
    });
  });

  it("повернення раніше за початок — помилка", () => {
    assert.throws(() => quote(ride("2026-11-10T10:30:00Z", "2026-11-10T10:00:00Z"), standard), {
      name: "QuoteError",
      message: /returnAt is before pickupAt/,
    });
  });

  it("невідомий тип велосипеда — помилка", () => {
    assert.throws(() => quote({ ...goodRide(), bike: "scooter" }, standard), {
      name: "QuoteError",
      message: /unknown bike type: scooter/,
    });
  });

  it("невідома станція повернення — помилка", () => {
    assert.throws(() => quote({ ...goodRide(), returnStation: "S99" }, standard), {
      name: "QuoteError",
      message: /unknown station: S99/,
    });
  });

  it("відсутній або невідомий тип користувача — помилка", () => {
    assert.throws(() => quote(goodRide(), undefined), { name: "QuoteError", message: /unknown rider type/ });
    assert.throws(() => quote(goodRide(), { type: "vip" }), { name: "QuoteError", message: /unknown rider type: vip/ });
  });

  it("леджер без rider.id — помилка", () => {
    assert.throws(() => quote(goodRide(), standard, { dayCap: createDayCap() }), {
      name: "QuoteError",
      message: /rider\.id is required/,
    });
  });

  it("помилки — екземпляри QuoteError (а отже й Error)", () => {
    try {
      quote(null, standard);
      assert.fail("мала бути помилка");
    } catch (error) {
      assert.ok(error instanceof QuoteError);
      assert.ok(error instanceof Error);
    }
  });
});

describe("discount(): відсоток зі сплатою, округленою вниз до копійки (T9)", () => {
  it("рівні суми: 50% від 100 → 50", () => {
    assert.equal(discount(100, 50), 50);
  });

  it("дробовий залишок округлюється на користь клієнта: 50% від 99 → знижка 50, сплата 49", () => {
    assert.equal(discount(99, 50), 50);
  });

  it("30% від 2500 → 750", () => {
    assert.equal(discount(2500, 30), 750);
  });

  it("крайні випадки: нульова сума і сума в 1 копійку", () => {
    assert.equal(discount(0, 50), 0);
    assert.equal(discount(1, 50), 1); // сплата floor(0.5) = 0
  });
});
