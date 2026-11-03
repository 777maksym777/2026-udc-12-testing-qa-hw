// quote() and formatReceipt() together, the way the API uses them.
import test from "node:test";
import assert from "node:assert/strict";
import { formatReceipt } from "../../src/receipt.js";
import { quote } from "../../src/tariff.js";
import { randomRider, randomRides } from "../helpers/factory.js";

const PRICE = { classic: 2500, ebike: 4000 };
const uah = (kopecks) => `${(kopecks / 100).toFixed(2).replace(".", ",")} грн`;

test("every receipt of a week of rides ends with the amount due", () => {
  const rider = randomRider();
  for (const ride of randomRides(10)) {
    const minutes = (Date.parse(ride.returnAt) - Date.parse(ride.pickupAt)) / 60_000;
    const expected = (Math.floor(minutes / 30) + 1) * PRICE[ride.bike];

    const lines = formatReceipt(quote(ride, rider));

    assert.ok(lines.at(-1).startsWith("До сплати "));
    assert.ok(
      lines.at(-1).endsWith(` ${uah(expected)}`),
      `${ride.bike}, ${minutes} min from ${ride.pickupAt}: got "${lines.at(-1)}", expected ${uah(expected)}`,
    );
  }
});

test("a receipt lists the fee for a return outside the zone", () => {
  const ride = {
    pickupAt: "2026-09-21T07:15:00Z",
    returnAt: "2026-09-21T07:35:00Z",
    bike: "classic",
    returnStation: "X02",
  };

  const lines = formatReceipt(quote(ride, randomRider()));

  assert.deepEqual(lines, [
    "Тривалість поїздки: 20 хв",
    "Погодинне нарахування .............. 25,00 грн",
    "Збір: повернення поза зоною ....... 150,00 грн",
    "До сплати ......................... 175,00 грн",
  ]);
});
