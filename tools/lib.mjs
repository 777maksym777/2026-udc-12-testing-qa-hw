// Shared helpers for tools/mutate.mjs and tools/repeat.mjs: find test files, run
// `node --test` in a child process (with a timeout that kills the whole process tree)
// and parse its TAP output.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const TEST_FILE = /\.test\.(c|m)?js$/;

/** Test files under `dirs` (relative to `appDir`), sorted, as forward-slash paths relative to `appDir`. */
export function listTestFiles(appDir, dirs) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (TEST_FILE.test(name)) files.push(relative(appDir, full).split(sep).join("/"));
    }
  };
  for (const dir of dirs) {
    const full = join(appDir, dir);
    if (existsSync(full) && statSync(full).isDirectory()) walk(full);
  }
  return files;
}

/**
 * Runs `node --test` over `files` in `cwd`.
 * @returns {Promise<{ code: number|null, stdout: string, stderr: string, timedOut: boolean, ms: number }>}
 */
export function runNodeTest({ cwd, files, reporter = "tap", timeoutMs = 120_000, env = {}, extraArgs = [] }) {
  const childEnv = { ...process.env, ...env };
  // When this tool itself runs under `node --test`, the child must not think it is a
  // test-runner subprocess (it would switch to the runner's internal protocol).
  delete childEnv.NODE_TEST_CONTEXT;
  const args = ["--test", `--test-reporter=${reporter}`, ...extraArgs, ...files];
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, ms: performance.now() - started });
    });
  });
}

/**
 * Runs every file of `files` in its own `node --test` child (all at once), so each result
 * is known to come from its file: two tests with the same name in different files stay two.
 * @returns {Promise<{ code: number, timedOut: string[], results: Array<{ file: string, key: string,
 *   path: string[], ok: boolean, skip: boolean, todo: boolean, error: string|null }>, ms: number }>}
 *   `code` is 0 only when every child exited with 0; `timedOut` lists the files whose child was killed;
 *   `key` is "file › name path" — unique per test.
 */
export async function runTestFiles({ cwd, files, timeoutMs = 120_000, env = {}, extraArgs = [] }) {
  const started = performance.now();
  const runs = await Promise.all(
    files.map(async (file) => ({ file, run: await runNodeTest({ cwd, files: [file], reporter: "tap", timeoutMs, env, extraArgs }) })),
  );
  const results = [];
  for (const { file, run } of runs) {
    const seen = new Map();
    for (const r of parseTap(run.stdout).results.filter((x) => x.leaf)) {
      // the same name twice in one file: the second one is "name (2)"
      const base = [file, ...r.path].join(" › ");
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const key = n === 1 ? base : `${base} (${n})`;
      results.push({ file, key, path: r.path, ok: r.ok, skip: r.skip, todo: r.todo, error: r.error });
    }
  }
  return {
    code: runs.some(({ run }) => run.code !== 0 || run.timedOut) ? 1 : 0,
    timedOut: runs.filter(({ run }) => run.timedOut).map(({ file }) => file),
    results,
    ms: performance.now() - started,
  };
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

/**
 * Parses the TAP output of `node --test --test-reporter=tap`.
 * @returns {{ results: Array<{ path: string[], ok: boolean, skip: boolean, todo: boolean, error: string|null, leaf: boolean }>, summary: Record<string, number> }}
 */
export function parseTap(text) {
  const lines = text.split(/\r?\n/);
  const results = [];
  const names = [];
  const summary = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;
    const level = Math.floor(indent / 4);
    const body = line.trim();

    const subtest = /^# Subtest: (.*)$/.exec(body);
    if (subtest) {
      names[level] = unescape(subtest[1]);
      names.length = level + 1;
      continue;
    }
    const total = /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)$/.exec(body);
    if (total && indent === 0) {
      summary[total[1]] = Number(total[2]);
      continue;
    }
    const result = /^(not ok|ok) \d+(?: - (.*))?$/.exec(body);
    if (!result) continue;
    const { name, directive } = splitDirective(result[2] ?? "");
    const path = [...names.slice(0, level), name];
    const yaml = readYamlBlock(lines, i + 1, indent);
    results.push({
      path,
      ok: result[1] === "ok",
      skip: /^SKIP\b/i.test(directive),
      todo: /^TODO\b/i.test(directive),
      error: result[1] === "ok" ? null : yaml.error,
      type: yaml.type,
    });
  }
  const key = (path) => path.join("\u0000");
  const parents = new Set();
  for (const r of results) {
    for (let n = 1; n < r.path.length; n++) parents.add(key(r.path.slice(0, n)));
  }
  for (const r of results) r.leaf = r.type !== "suite" && !parents.has(key(r.path));
  return { results, summary };
}

function splitDirective(text) {
  const match = /^(.*?)(?<!\\) # ((?:SKIP|TODO)\b.*)$/i.exec(text);
  return match ? { name: unescape(match[1]), directive: match[2] } : { name: unescape(text), directive: "" };
}

function unescape(name) {
  return name.replace(/\\(.)/g, "$1");
}

function readYamlBlock(lines, start, indent) {
  const out = { error: null, type: null };
  if (lines[start]?.trim() !== "---") return out;
  for (let i = start + 1; i < lines.length; i++) {
    const body = lines[i].trim();
    if (body === "...") break;
    const type = /^type: '(\w+)'$/.exec(body);
    if (type) out.type = type[1];
    const error = /^error: (.*)$/.exec(body);
    if (error && lines[i].length - lines[i].trimStart().length === indent + 2) {
      if (error[1] === "|-" || error[1] === "|") {
        const block = [];
        for (let j = i + 1; j < lines.length; j++) {
          const deeper = lines[j].length - lines[j].trimStart().length > indent + 2 || lines[j].trim() === "";
          if (!deeper) break;
          block.push(lines[j].trim());
        }
        out.error = block.filter(Boolean).join(" ").trim();
      } else {
        out.error = error[1].replace(/^'(.*)'$/, "$1").replace(/''/g, "'");
      }
    }
  }
  return out;
}
