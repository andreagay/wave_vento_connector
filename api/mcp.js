// Vercel serverless function: the public MCP endpoint (rewritten from /mcp).
import { handleMcpRequest } from "../src/http.js";

export default async function handler(req, res) {
  let body;
  if (req.method === "POST") {
    try {
      body = req.body; // Vercel parses JSON bodies; access throws on invalid JSON.
    } catch {
      body = undefined;
    }
  }
  await handleMcpRequest(req, res, body);
}
