#!/usr/bin/env node
// Runs the app's whole test suite N times and shows how often each test failed (Task D).
//
//   npm run test:repeat              20 runs
//   npm run test:repeat -- 50        50 runs
//   node tools/repeat.mjs 30 --app <dir> --tests test/unit,test/integration --all
//
// Every run is a fresh `node --test --test-reporter=tap` per test file of the app (default:
// everything under app/test; the files of one run go in parallel). Each run gets the
// environment variable REPEAT_RUN=1…N. A test is its file plus its name, so two tests with
// the same name in different files are counted apart. The table lists, file by file, every
// test that failed at least once (or all tests with --all), with failures/N and the first
// distinct failure messages.
// Exit code 1 when any test failed in any run, 0 when all N runs were green.

import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listTestFiles, runTestFiles } from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function repeat({ runs = 20, app = join(ROOT, "app"), tests = ["test"], timeoutMs = 120_000, log = () => {} } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error("кількість прогонів — ціле число ≥ 1");
  if (!existsSync(app)) throw new Error(`немає каталогу ${app}`);
  const files = listTestFiles(app, tests);
  if (files.length === 0) throw new Error(`у ${tests.join(", ")} немає файлів *.test.js`);

  const started = performance.now();
  const stats = new Map();
  const redRuns = [];
  const entry = (key, file, name) => {
    if (!stats.has(key)) stats.set(key, { key, file, name, runs: 0, failures: 0, skipped: 0, messages: [] });
    return stats.get(key);
  };
  for (let run = 1; run <= runs; run++) {
    const result = await runTestFiles({ cwd: app, files, timeoutMs, env: { REPEAT_RUN: String(run) } });
    let red = result.code !== 0;
    for (const r of result.results) {
      const s = entry(r.key, r.file, r.path.join(" › "));
      s.runs++;
      if (r.skip || r.todo) s.skipped++;
      else if (!r.ok) {
        s.failures++;
        red = true;
        const message = (r.error ?? "").slice(0, 300);
        if (s.messages.length < 3 && !s.messages.includes(message)) s.messages.push(message);
      }
    }
    for (const file of result.timedOut) {
      const s = entry(`${file} › (таймаут прогону)`, file, "(таймаут прогону)");
      s.runs++;
      s.failures++;
    }
    if (red) redRuns.push(run);
    log(`  прогін ${run}/${runs}: ${red ? "червоний" : "зелений"}`);
  }
  return {
    runs,
    app,
    files,
    redRuns,
    tests: [...stats.values()].sort((a, b) => b.failures - a.failures || a.file.localeCompare(b.file) || a.name.localeCompare(b.name)),
    durationMs: Math.round(performance.now() - started),
  };
}

export function formatRepeat(report, { all = false } = {}) {
  const out = [];
  const where = relative(process.cwd(), report.app).split(sep).join("/") || ".";
  out.push(`Прогонів: ${report.runs} (${where}: файлів ${report.files.length}, тестів ${report.tests.length})`);
  const numbers = report.redRuns.length > 20 ? `${report.redRuns.slice(0, 20).join(", ")}, …` : report.redRuns.join(", ");
  out.push(`Червоних прогонів: ${report.redRuns.length} з ${report.runs}${report.redRuns.length ? ` (№ ${numbers})` : ""}`);
  const shown = all ? report.tests : report.tests.filter((t) => t.failures > 0);
  if (shown.length) {
    // file by file, the files in the order of their worst test
    const byFile = new Map();
    for (const t of shown) byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]);
    const width = Math.min(80, Math.max(6, ...shown.map((t) => t.name.length + 2)));
    out.push("");
    out.push(`${"файл / тест".padEnd(width)}  падінь`);
    for (const [file, tests] of byFile) {
      out.push(file);
      for (const t of tests) {
        const name = t.name.length > width - 2 ? `${t.name.slice(0, width - 5)}...` : t.name;
        out.push(`  ${name.padEnd(width - 2)}  ${t.failures}/${report.runs}${t.skipped ? `  (пропущено ${t.skipped})` : ""}`);
        for (const m of t.messages) out.push(`${" ".repeat(6)}↳ ${m}`);
      }
    }
  }
  const green = report.tests.filter((t) => t.failures === 0).length;
  if (!all && green) out.push("", `Решта тестів (${green}) — зелені в усіх прогонах.`);
  out.push("", `Час: ${(report.durationMs / 1000).toFixed(1)} с`);
  return out.join("\n");
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg}: потрібне значення`);
      return argv[++i];
    };
    if (/^\d+$/.test(arg)) opts.runs = Number(arg);
    else if (arg === "--app") opts.app = resolve(value());
    else if (arg === "--tests") opts.tests = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--all") opts.all = true;
    else throw new Error(`невідомий аргумент: ${arg}`);
  }
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  let report;
  try {
    report = await repeat({ ...opts, log: (msg) => console.error(msg) });
  } catch (err) {
    console.error(`Помилка: ${err.message}`);
    process.exit(2);
  }
  console.log(formatRepeat(report, opts));
  process.exitCode = report.redRuns.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
