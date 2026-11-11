// Unit-тести для app/src/day-cap.js (B1: написані за кодом, без npm-залежностей).
// Запуск із кореня теки: node --test "ai-runs/b1-from-code/*.test.js"

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DAY_CAP, dayKey, createDayCap } from "../../app/src/day-cap.js";

describe("DAY_CAP", () => {
  it("денний ліміт за замовчуванням — 30000 копійок", () => {
    assert.equal(DAY_CAP, 30000);
  });
});

describe("dayKey(): день бронювання за моментом початку", () => {
  it("повертає дату YYYY-MM-DD для мітки часу в мс (як передає tariff.js)", () => {
    assert.equal(dayKey(Date.UTC(2026, 10, 10, 12, 34)), "2026-11-10");
  });

  it("межа доби за UTC: 23:59 — ще попередній день, 00:00 — вже наступний", () => {
    assert.equal(dayKey(Date.UTC(2026, 10, 9, 23, 59)), "2026-11-09");
    assert.equal(dayKey(Date.UTC(2026, 10, 10, 0, 0)), "2026-11-10");
  });

  it("день визначається за UTC, а не за локальним офсетом рядка", () => {
    // 01:00 за Києвом (+02:00) — це ще 23:00 попередньої доби за UTC
    assert.equal(dayKey("2026-11-10T01:00:00+02:00"), "2026-11-09");
  });
});

describe("createDayCap(): леджер денних списань", () => {
  const NOON = Date.UTC(2026, 10, 10, 12, 0);

  it("ліміт за замовчуванням — DAY_CAP", () => {
    assert.equal(createDayCap().limit, DAY_CAP);
  });

  it("без записів залишок дорівнює ліміту", () => {
    const cap = createDayCap();
    assert.equal(cap.remaining("r-1", NOON), DAY_CAP);
  });

  it("record зменшує залишок на записану суму", () => {
    const cap = createDayCap();
    cap.record("r-1", NOON, 2500);
    assert.equal(cap.remaining("r-1", NOON), DAY_CAP - 2500);
  });

  it("кілька записів за день накопичуються", () => {
    const cap = createDayCap();
    cap.record("r-1", NOON, 2500);
    cap.record("r-1", Date.UTC(2026, 10, 10, 18, 0), 5000);
    assert.equal(cap.chargedOn("r-1", "2026-11-10"), 7500);
    assert.equal(cap.remaining("r-1", NOON), DAY_CAP - 7500);
  });

  it("залишок не стає відʼємним, якщо списано понад ліміт", () => {
    const cap = createDayCap({ limit: 1000 });
    cap.record("r-1", NOON, 1500);
    assert.equal(cap.remaining("r-1", NOON), 0);
  });

  it("користувачі обліковуються окремо", () => {
    const cap = createDayCap();
    cap.record("r-1", NOON, 10000);
    assert.equal(cap.remaining("r-2", NOON), DAY_CAP);
    assert.equal(cap.chargedOn("r-2", "2026-11-10"), 0);
  });

  it("дні обліковуються окремо: вчорашні списання не зачіпають сьогодні", () => {
    const cap = createDayCap();
    cap.record("r-1", Date.UTC(2026, 10, 9, 12, 0), 30000);
    assert.equal(cap.remaining("r-1", NOON), DAY_CAP);
    assert.equal(cap.chargedOn("r-1", "2026-11-09"), 30000);
  });

  it("власний ліміт поважається і зберігається в полі limit", () => {
    const cap = createDayCap({ limit: 4000 });
    assert.equal(cap.limit, 4000);
    cap.record("r-1", NOON, 2500);
    assert.equal(cap.remaining("r-1", NOON), 1500);
  });

  it("chargedOn повертає 0 для дня без записів", () => {
    const cap = createDayCap();
    assert.equal(cap.chargedOn("r-1", "2026-11-10"), 0);
  });
});
