- Інструмент і модель: Claude Code, окремий субагент general-purpose (Claude Fable 5)
- Дата: 2026-11-11
- Що бачила сесія: репозиторій (прогін у репо, нова сесія); стандартний контекст Claude Code (`CLAUDE.md`/`AGENTS.md` репо). До промпту додано один службовий рядок зі шляхом кореня репо.
- Що було ввімкнено з пам'яті й глобальних правил: нічого (персистентна пам'ять порожня, глобальних правил немає)
- Промпт (дослівно):

  > npm run mutate рахує мутаційний бал тестів app/test/unit/ і app/test/spec/ для
  > app/src/tariff.js і app/src/day-cap.js. Посиль тести, щоб мутаційний бал виріс.
  > Запусти npm run mutate до і після змін і покажи обидва підсумки.

---

Mutation score raised from 83.1 % to 97.6 % by strengthening the unit tests. No source code changed — only tests.

## Before (npm run mutate, baseline)
```
Мутаційне тестування
  цілі:   app/src/tariff.js, app/src/day-cap.js
  тести:  app/test/unit, app/test/spec — файлів: 10, тестів: 55, пропущено: 0, todo: 0, викликів assert: 60

файл                мутантів     вбито    вижило   таймаут     score
app/src/tariff.js         76        64        12         0    84.2 %
app/src/day-cap.js         7         5         2         0    71.4 %
разом                     83        69        14         0    83.1 %
```
Survivors: M014, M016, M018, M019, M023, M024, M030, M054, M055, M064, M066, M075, M080, M083 (matches ai-runs/c-before.txt exactly).

## After (npm run mutate, with new tests)
```
Мутаційне тестування
  цілі:   app/src/tariff.js, app/src/day-cap.js
  тести:  app/test/unit, app/test/spec — файлів: 10, тестів: 66, пропущено: 0, todo: 0, викликів assert: 85

файл                мутантів     вбито    вижило   таймаут     score
app/src/tariff.js         76        74         2         0    97.4 %
app/src/day-cap.js         7         7         0         0   100.0 %
разом                     83        81         2         0    97.6 %
```
12 of 14 survivors killed; day-cap.js is at 100 %.

## What was added
C:\Users\777ma\IdeaProjects\2026-udc-12-testing-qa-hw\app\test\unit\tariff.test.js — 9 new tests, each annotated with the mutant it kills:
- M030 (60_000→60001): ride of 30 min 0.030 s must give 31 minutes / 2 blocks.
- M014 (24*60→24*61): 24 h 01 min ride must carry the unreturned fee (fees deep-equal, total 230000).
- M024 (due−allowance→+): day-cap discount amount asserted exactly (95000 on a 25 h ride).
- M023 (>→>=): a charge landing exactly on the 30000 cap must produce no day-cap line.
- M018 (due>0→>=0): a free night ride (false start at 01:30 Kyiv) must have an empty discounts array.
- M054/M055 (Math.floor→ceil/round in exported discount()): direct T9 tests with fractional remainders — discount(1001,30)=301, discount(3,50)=2.
- M064 (||→&& in readRide): quote(null, …) must throw QuoteError "ride is required", not a TypeError.
- M066 (<→<=): zero-duration ride pinned as allowed and free (noted as current behaviour per open spec question Q-3).
- M075 (||→&& in instant): a parseable string without a timezone offset must still be rejected (exact QuoteError messages for pickupAt and returnAt).

C:\Users\777ma\IdeaProjects\2026-udc-12-testing-qa-hw\app\test\unit\day-cap.test.js — 2 new tests + 1 tightened assert:
- M080 (??0→??1 in remaining): a fresh rider's remaining equals DAY_CAP exactly.
- M083 (??0→??1 in chargedOn): chargedOn is 0 for a day without rides and sums the day's records (12000+5000=17000).
- Existing "charges recorded…" test tightened from `< DAY_CAP` to an exact `DAY_CAP - 12000`.

## Remaining 2 survivors are equivalent mutants
M016 (`plan.amount > 0` → `> 1`) and M019 (`due > 0` → `> 1`) cannot be killed through quote(): with rates 2500/4000 kopecks and percents 20/30/50, every reachable discount amount and due is a multiple of 800/1250/2500/3200, so a value of exactly 1 kopeck is unreachable. Worth mentioning in docs/test-quality.md as equivalent mutants.

## Notes for the user
- All 66 unit+spec tests pass; full `npm test` is 68/68 green.
- During one full-suite run the pre-existing flaky integration test failed: app/test/integration/receipt.test.js "every receipt of a week of rides ends with the amount due" expects `(Math.floor(minutes/30)+1)` blocks, which over-counts whenever a random ride (app/test/helpers/factory.js, Math.random, 5–89 min) lands on exactly 30 or 60 minutes. This is unrelated to these changes, outside the mutation suites (mutate runs only test/unit + test/spec), and is the subject of Task D — I did not touch it.
- I did not write ai-runs/c-after.txt or c-strengthen.* — per AGENTS.md those are the participant's verbatim records; the two full `npm run mutate` outputs above are ready to be saved there. Nothing was committed.
