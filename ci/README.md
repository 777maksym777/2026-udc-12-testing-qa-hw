# Падіння CI за тиждень 19–23.10.2026

Чотири невдалі прогони пайплайна команди «Велопрокату громади» за робочий тиждень. Кожен
прогін запустив pull request у `main`; зелені прогони того тижня сюди не потрапили.

## Що тут лежить

- `runs/run-NNNN.log` — лог першої спроби прогону `NNNN`, як його показує CI (час у UTC).
- `changes/run-NNNN.diff` — зміна з pull request, який запустив прогін, відносно `main`
  цього репозиторію. Застосувати локально: `git apply ci/changes/run-NNNN.diff`
  (повернути: `git apply -R ci/changes/run-NNNN.diff`).

## Пайплайн

Одна задача `test` на hosted-раннері з Ubuntu, Node 24.x. Кроки:

1. `actions/checkout` — merge-коміт pull request;
2. `actions/setup-node` з кешем npm;
3. `npm ci` у `app/`;
4. `npm audit --audit-level=high` (`continue-on-error: true`);
5. `npm test` у `app/`;
6. smoke: `npm start` у фоні й `curl` до `/api/health` (крок виконується, лише якщо
   тести пройшли).

## Прогони

| Прогін | Початок (Київ) | Pull request | Гілка | Коміт PR | Спроби | Лог | Зміна |
|---|---|---|---|---|---|---|---|
| 1141 | 2026-10-19 10:12 | #231 Тести: поїздки в ніч переведення годинника | `tests/clock-change-night` | `2618d88` | 1 — помилка | [`runs/run-1141.log`](runs/run-1141.log) | [`changes/run-1141.diff`](changes/run-1141.diff) |
| 1144 | 2026-10-20 15:41 | #233 Сторінка: підказка про збір за поїздку понад добу | `ui/return-hint` | `e3dc84e` | 1 — помилка; 2 (перезапуск того самого коміту) — успішно | [`runs/run-1144.log`](runs/run-1144.log) | [`changes/run-1144.diff`](changes/run-1144.diff) |
| 1147 | 2026-10-22 11:05 | #236 server: PORT через parseInt, коротший рядок запуску | `chore/port-parsing` | `40a6678` | 1 — помилка; 2 (перезапуск того самого коміту) — помилка | [`runs/run-1147.log`](runs/run-1147.log) | [`changes/run-1147.diff`](changes/run-1147.diff) |
| 1152 | 2026-10-23 16:27 | #238 tariff: спростити feesFor | `refactor/fees` | `27fba14` | 1 — помилка | [`runs/run-1152.log`](runs/run-1152.log) | [`changes/run-1152.diff`](changes/run-1152.diff) |
