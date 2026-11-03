# Велопрокат громади

Сервіс розрахунку вартості поїздки для велопрокату громади: користувач бере велосипед
на станції, повертає його на станції або на точці повернення, а сервіс рахує ціну за
тарифами (`../docs/spec/tariffs.md`) і формує чек.

## Що всередині

- `src/tariff.js` — `quote(ride, rider, { zones, dayCap })`: вартість поїздки по
  статтях у копійках (`minutes`, `timeCharge`, `discounts`, `fees`, `total`).
- `src/day-cap.js` — облік денного ліміту: `createDayCap()` повертає журнал, у який
  `quote` записує нараховане за добу.
- `src/zones.js` — станції та зони; `src/receipt.js` — текст чека.
- `src/server.js` — HTTP API: `GET /` (сторінка), `POST /api/quote`, `GET /api/health`.
- `public/index.html` — сторінка розрахунку.

## Локально

```bash
npm test      # Node 22.5+, без npm install — залежностей немає
npm start     # http://localhost:3000
```

Приклад запиту:

```bash
curl -s http://localhost:3000/api/quote -H 'content-type: application/json' \
  -d '{"ride":{"pickupAt":"2026-09-16T07:00:00Z","returnAt":"2026-09-16T07:40:00Z","bike":"classic","returnStation":"S03"},"rider":{"type":"standard"}}'
```
