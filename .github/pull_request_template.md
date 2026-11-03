## WS12: <ім'я>

### Що зроблено

- [ ] **Task A** — `ai-runs/a1-from-code.md` + `ai-runs/a2-from-spec.md`; `docs/test-cases.md`; `docs/traceability.md`; `docs/ai-test-checklist.md`
- [ ] **Task B** — `ai-runs/b1-from-code/*.test.js`, `ai-runs/b1-from-code.md`, `ai-runs/b1-run.txt`, `ai-runs/b2-run.txt`, `ai-runs/b1-rerun.txt`; `app/test/spec/*.test.js`; виправлення в `app/src/`; `docs/bugs/README.md`; `docs/bugs/BUG-<N>.md`
- [ ] **Task C** — `ai-runs/c-before.txt`, `ai-runs/c-smells.md`, `ai-runs/c-strengthen.md`, `ai-runs/c-strengthen.diff`, `ai-runs/c-after.txt`, `ai-runs/c-with-rules.md`, `ai-runs/c-with-rules/*.test.js`; `docs/test-quality.md`; `app/AGENTS.md` «## Тести» (або файл правил IDE: <шлях>)
- [ ] **Task D** — `ai-runs/d-repeat-before.txt`, `ai-runs/d-flaky-first.md`, `ai-runs/d-flaky-first.diff`, `ai-runs/d-repeat-after.txt`, `ai-runs/d-ci-first.md`; `docs/triage.md`; `docs/bugs/CI-<NNNN>.md` на кожен прогін класу «код» (або «немає» в `docs/triage.md`)
- [ ] **Task E (bonus)** — `docs/task-e-bonus.md` (шлях: <1 / 2 / 3>)

### Числа

- **Task A** (сходиться з «Що AI вигадав» у `docs/test-cases.md`): правил покрито: A1 — <X> з 10, A2 — <Y> з 10; очікувань, яких немає в спеці: A1 — <…>, A2 — <…>; неоднозначностей позначено як питання: A1 — <…>, A2 — <…>
- **Task B:** дефектів, які знайшли тести з коду: <X>; тести зі спеки: <Y>; тестів з коду, що зафіксували дефект: <Z>
- **Task C:** покриття рядків <…> % → <…> %; мутаційний бал <…> % → <…> %; тестів <…> → <…>; викликів assert <…> → <…>; тестів, які AI видалив / пропустив / послабив: <…>
- **Task D:** перша відповідь AI про флакі: ретрай/sleep/skip — <так / ні: що саме>; після виправлення — <0> падінь з 50; тріаж CI (правильність оцінить ментор):

| Прогін | Ваш клас | Головний доказ | Клас від AI |
|---|---|---|---|
| run-… | | | |
| run-… | | | |
| run-… | | | |
| run-… | | | |

### Перевірка

- [ ] `npm test` — зелений; `npm run test:unit` — зелений; `npm run test:tools` — зелений
- [ ] Кожен прогін AI — у новій сесії; у `ai-runs/` — перші відповіді дослівно
- [ ] `docs/spec/` і `ci/` не змінено (`git diff --stat main -- docs/spec ci` — порожньо); `tools/` і `docs/templates/` не змінено
- [ ] Жоден тест не видалено, не пропущено і не послаблено без причини нижче; у тестах немає повторів і очікувань
- [ ] Нічого в `.github/workflows/`; жодних npm-залежностей, секретів і `.env`

### Інструмент і модель

### Змінені або видалені тести і чому (якщо є)

### Що здивувало найбільше
