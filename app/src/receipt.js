// Human-readable receipt for a quote (T9): one line per item, amounts in UAH.

const WIDTH = 46;

const LABELS = {
  subscription: "Знижка: абонемент",
  reduced: "Знижка: пільговий тариф",
  night: "Знижка: нічна",
  "day-cap": "Денний ліміт",
  "out-of-zone": "Збір: повернення поза зоною",
  unreturned: "Збір: неповернений велосипед",
};

/** 230000 → "2 300,00 грн", -2500 → "-25,00 грн". */
export function formatUah(kopecks) {
  const sign = kopecks < 0 ? "-" : "";
  const abs = Math.abs(kopecks);
  const hryvnias = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}${hryvnias},${rest} грн`;
}

/** @returns {string[]} the receipt lines; the last one is the amount due */
export function formatReceipt(quote) {
  const lines = [`Тривалість поїздки: ${quote.minutes} хв`, line("Погодинне нарахування", quote.timeCharge)];
  for (const item of quote.discounts) lines.push(line(LABELS[item.code] ?? item.code, -item.amount));
  for (const item of quote.fees) lines.push(line(LABELS[item.code] ?? item.code, item.amount));
  lines.push(line("До сплати", quote.total));
  return lines;
}

function line(label, amount) {
  const value = formatUah(amount);
  const dots = ".".repeat(Math.max(3, WIDTH - label.length - value.length - 2));
  return `${label} ${dots} ${value}`;
}
