#!/usr/bin/env node
// Local stdio transport, for Claude Desktop / Claude Code configs that run the
// server as a command instead of connecting to the remote URL.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

await createServer().connect(new StdioServerTransport());
