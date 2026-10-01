import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("stdio entry point speaks MCP", async () => {
  const client = new Client({ name: "stdio-test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../src/stdio.js", import.meta.url))],
      stderr: "pipe",
    }),
  );
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === "search_program"));
    const result = await client.callTool({ name: "search_program", arguments: { type: "party" } });
    assert.match(result.content[0].text, /\.WAV: official closing party/);
    assert.match(result.content[0].text, /Friday 9 October 2026, from 22:00/);
  } finally {
    await client.close();
  }
});
