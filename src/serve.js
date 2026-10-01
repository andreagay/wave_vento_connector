#!/usr/bin/env node
// Standalone HTTP server: MCP endpoint on /mcp, landing page on /.
// Use it locally (npm start) or on any Node host (Render, Railway, Fly, Docker).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { handleMcpRequest, readJsonBody } from "./http.js";
import { NAME, VERSION } from "./version.js";

const LANDING_PAGE = fileURLToPath(new URL("../public/index.html", import.meta.url));

export function createHttpServer() {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    try {
      if (pathname === "/mcp" || pathname === "/mcp/") {
        const body = req.method === "POST" ? await readJsonBody(req) : undefined;
        await handleMcpRequest(req, res, body);
      } else if (pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", name: NAME, version: VERSION }));
      } else if ((pathname === "/" || pathname === "/index.html") && (req.method === "GET" || req.method === "HEAD")) {
        const html = await readFile(LANDING_PAGE);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(req.method === "HEAD" ? undefined : html);
      } else {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(err.status ?? 500, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: err.status === 400 ? -32700 : -32603, message: err.message }, id: null }));
      }
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 3000;
  createHttpServer().listen(port, () => {
    console.log(`Wave by Vento MCP server: http://localhost:${port}/mcp (landing page: http://localhost:${port}/)`);
  });
}
