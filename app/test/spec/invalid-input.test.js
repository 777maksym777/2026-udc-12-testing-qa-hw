// Spec tests for §4 «Некоректні дані»: the quote is refused with an explanation.
// Expected values: docs/test-cases.md TC-34..TC-37 and docs/spec/tariffs.md:147-149.
// The zero-duration ride (Q-3, «Питання до специфікації») is not automated.

import test from "node:test";
import assert from "node:assert/strict";
import { QuoteError, quote } from "../../src/tariff.js";

const ride = (pickupAt, returnAt, extra = {}) =>
  ({ pickupAt, returnAt, bike: "classic", returnStation: "S03", ...extra });
const standard = { type: "standard" };

const cases = [
  {
    name: "§4: a return earlier than the pickup is rejected with an explanation (TC-34)",
    ride: ride("2026-09-16T08:00:00+03:00", "2026-09-16T07:00:00+03:00"),
    rider: standard,
  },
  {
    name: "§4: an unknown bike type (scooter) is rejected with an explanation (TC-35)",
    ride: ride("2026-09-16T10:00:00+03:00", "2026-09-16T10:20:00+03:00", { bike: "scooter" }),
    rider: standard,
  },
  {
    name: "§4: an unknown rider category (visitor) is rejected with an explanation (TC-36)",
    ride: ride("2026-09-16T10:00:00+03:00", "2026-09-16T10:20:00+03:00"),
    rider: { type: "visitor" },
  },
  {
    name: "§4: a return station missing from додаток А (S99) is rejected with an explanation (TC-37)",
    ride: ride("2026-09-16T10:00:00+03:00", "2026-09-16T10:20:00+03:00", { returnStation: "S99" }),
    rider: standard,
  },
];

for (const c of cases) {
  test(c.name, () => {
    assert.throws(
      () => quote(c.ride, c.rider),
      (error) => error instanceof QuoteError && error.message.length > 0,
    );
  });
}
