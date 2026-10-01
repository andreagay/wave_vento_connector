// Stateless Streamable HTTP handler shared by the Vercel function (api/mcp.js)
// and the standalone Node server (src/serve.js).
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(payload));
}

const rpcError = (code, message) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

/**
 * Handles one request to the /mcp endpoint. `body` is the already-parsed JSON
 * body (Vercel provides it as req.body). Each POST gets a fresh server and
 * transport, so the endpoint scales on serverless platforms without sessions.
 */
export async function handleMcpRequest(req, res, body) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && /text\/html/.test(req.headers.accept ?? "")) {
    // Someone opened the connector URL in a browser: show the landing page.
    res.writeHead(302, { location: "/" });
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, rpcError(-32000, "Method not allowed: this stateless MCP endpoint only accepts POST."), { allow: "POST, OPTIONS" });
    return;
  }
  if (body === undefined || body === null || typeof body !== "object") {
    sendJson(res, 400, rpcError(-32700, "Parse error: expected a JSON-RPC body."));
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) sendJson(res, 500, rpcError(-32603, "Internal server error"));
  }
}

export async function readJsonBody(req, limitBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw Object.assign(new Error("Request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}
