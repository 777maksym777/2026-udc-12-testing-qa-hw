import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createHandler } from "../../src/server.js";

// The handler is a plain (req, res) function, so tests never open a port.
function fakeReq(method, url, body) {
  const chunks = body === undefined ? [] : [typeof body === "string" ? body : JSON.stringify(body)];
  return Object.assign(Readable.from(chunks), { method, url, headers: {} });
}

async function call(method, url, body) {
  const res = {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(chunk = "") {
      this.body = chunk;
    },
  };
  await createHandler({ page: () => "<!doctype html><title>test</title>" })(fakeReq(method, url, body), res);
  return res;
}

test("GET / serves the page and GET /api/health answers", async () => {
  const page = await call("GET", "/");
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"], /text\/html/);

  const health = await call("GET", "/api/health");
  assert.deepEqual(JSON.parse(health.body), { status: "ok" });
});

test("POST /api/quote returns the quote and the receipt", async () => {
  const res = await call("POST", "/api/quote", {
    ride: { pickupAt: "2026-09-16T07:00:00Z", returnAt: "2026-09-16T07:40:00Z", bike: "classic", returnStation: "S03" },
    rider: { type: "standard" },
  });
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.quote.total, 5000);
  assert.ok(json.receipt.at(-1).endsWith("50,00 грн"));
});

test("POST /api/quote answers 400 to a body that is not JSON", async () => {
  const res = await call("POST", "/api/quote", "{ride:");
  assert.equal(res.status, 400);
  assert.ok(JSON.parse(res.body).error);
});
