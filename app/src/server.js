// HTTP API and the web page of the bike share.
//
//   GET  /             the page from public/index.html
//   POST /api/quote    { ride, rider } → { quote, receipt }   (see src/tariff.js)
//   GET  /api/health   { status: "ok" }
//
// createHandler(deps) returns a plain (req, res) function, so tests never open a port.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { formatReceipt } from "./receipt.js";
import { QuoteError, quote } from "./tariff.js";
import { stationZones } from "./zones.js";

const INDEX_HTML = new URL("../public/index.html", import.meta.url);
const MAX_BODY_BYTES = 16 * 1024;

class BadRequest extends Error {}

export function createHandler({ zones = stationZones, page = () => readFileSync(INDEX_HTML, "utf8") } = {}) {
  return async function handle(req, res) {
    const { pathname } = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && pathname === "/") {
        return send(res, 200, page(), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && pathname === "/api/health") {
        return sendJson(res, 200, { status: "ok" });
      }
      if (req.method === "POST" && pathname === "/api/quote") {
        const body = await readJson(req);
        const result = quote(body.ride, body.rider, { zones });
        return sendJson(res, 200, { quote: result, receipt: formatReceipt(result) });
      }
      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      if (err instanceof QuoteError || err instanceof BadRequest) return sendJson(res, 400, { error: err.message });
      return sendJson(res, 500, { error: "internal error" });
    }
  };
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new BadRequest("request body is too large");
    chunks.push(bytes);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequest("request body is not valid JSON");
  }
  if (!body || typeof body !== "object") throw new BadRequest("request body must be a JSON object");
  return body;
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function send(res, status, body, contentType) {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  createServer(createHandler()).listen(port, () => {
    console.log(`Велопрокат громади: http://localhost:${port}`);
  });
}
