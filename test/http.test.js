import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import vercelMcp from "../api/mcp.js";
import vercelHealth from "../api/health.js";
import { createHttpServer } from "../src/serve.js";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

async function exerciseMcp(baseUrl) {
  const client = new Client({ name: "http-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  try {
    assert.equal(client.getServerVersion().name, "wave-by-vento");
    const { tools } = await client.listTools();
    assert.equal(tools.length, 5);
    const info = await client.callTool({ name: "get_event_info", arguments: { topic: "access_badge" } });
    assert.match(info.content[0].text, /identity document/);
    const speakers = await client.callTool({ name: "find_speakers", arguments: { query: "Revolut" } });
    assert.match(speakers.content[0].text, /Nik Storonsky/);
  } finally {
    await client.close();
  }
}

describe("standalone Node server", () => {
  let server;
  let base;
  before(async () => {
    server = createHttpServer();
    base = await listen(server);
  });
  after(() => server.close());

  test("serves MCP over Streamable HTTP", () => exerciseMcp(base));

  test("rejects GET streams with 405 and redirects browsers to the landing page", async () => {
    const stream = await fetch(`${base}/mcp`, { headers: { accept: "text/event-stream" } });
    assert.equal(stream.status, 405);
    assert.equal(stream.headers.get("allow"), "POST, OPTIONS");
    const browser = await fetch(`${base}/mcp`, { headers: { accept: "text/html" }, redirect: "manual" });
    assert.equal(browser.status, 302);
    assert.equal(browser.headers.get("location"), "/");
  });

  test("answers CORS preflight", async () => {
    const res = await fetch(`${base}/mcp`, { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.match(res.headers.get("access-control-allow-headers"), /mcp-protocol-version/);
  });

  test("returns a JSON-RPC parse error for invalid bodies", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{oops" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, -32700);
  });

  test("serves the landing page and health check", async () => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(await page.text(), /Wave by Vento 2026/);
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.status, "ok");
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});

// Emulates Vercel's Node runtime: rewrites /mcp to the function and exposes the
// parsed JSON body as req.body (whose getter throws on invalid JSON).
describe("Vercel function", () => {
  let server;
  let base;
  before(async () => {
    server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      Object.defineProperty(req, "body", {
        get() {
          if (!raw) return undefined;
          return JSON.parse(raw);
        },
      });
      const { pathname } = new URL(req.url, "http://x");
      if (pathname === "/mcp") return vercelMcp(req, res);
      if (pathname === "/health") return vercelHealth(req, res);
      res.writeHead(404).end();
    });
    base = await listen(server);
  });
  after(() => server.close());

  test("serves MCP over Streamable HTTP", () => exerciseMcp(base));

  test("handles invalid JSON without crashing", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{oops" });
    assert.equal(res.status, 400);
  });

  test("health endpoint", async () => {
    assert.equal((await (await fetch(`${base}/health`)).json()).status, "ok");
  });
});
