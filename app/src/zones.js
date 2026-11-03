// Stations and return points of the bike share and their zone (docs/spec/tariffs.md, додаток А).

export const STATIONS = Object.freeze({
  S01: { name: "Центральна площа", zone: "in" },
  S02: { name: "Залізничний вокзал", zone: "in" },
  S03: { name: "Міський парк", zone: "in" },
  S04: { name: "Ліцей № 2", zone: "in" },
  S05: { name: "Стадіон", zone: "in" },
  S06: { name: "Ринок", zone: "in" },
  S07: { name: "Лікарня", zone: "in" },
  S08: { name: "Бібліотека", zone: "in" },
  X01: { name: "Озеро (пляж)", zone: "out" },
  X02: { name: "Садове товариство «Калина»", zone: "out" },
  X03: { name: "Промзона, КПП № 1", zone: "out" },
});

/** Zone lookup over a station table; `quote` takes it as an option, so tests can pass their own. */
export function createZones(stations = STATIONS) {
  return {
    zoneOf(stationId) {
      return Object.hasOwn(stations, stationId) ? stations[stationId].zone : null;
    },
    list() {
      return Object.entries(stations).map(([id, station]) => ({ id, ...station }));
    },
  };
}

export const stationZones = createZones();
