// Wall-clock date and time in Kyiv for an instant, whatever the machine's time zone.

const FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** @returns {{ date: string, hour: number, minute: number }} date as YYYY-MM-DD */
export function kyivTime(instant) {
  const parts = {};
  for (const { type, value } of FORMAT.formatToParts(new Date(instant))) parts[type] = value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}
