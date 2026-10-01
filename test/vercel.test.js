import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

// Vercel's "Node" preset turns any server.{js,ts,...} or src/server.* into a
// catch-all function. Our src/server.js was picked up that way and every
// request failed with FUNCTION_INVOCATION_FAILED, so guard against both causes.
test("vercel.json forces the 'Other' preset (static public/ plus api/ functions)", () => {
  const config = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
  assert.ok("framework" in config && config.framework === null, 'vercel.json must set "framework": null');
  assert.deepEqual(
    config.rewrites.map((r) => [r.source, r.destination]),
    [
      ["/mcp", "/api/mcp"],
      ["/health", "/api/health"],
    ],
  );
  for (const fn of ["api/mcp.js", "api/health.js", "public/index.html"]) assert.ok(existsSync(new URL(fn, root)), fn);
});

test("no file looks like a Node server entrypoint to Vercel", () => {
  for (const dir of ["", "src/"]) {
    for (const ext of ["cjs", "js", "mjs", "mts", "ts", "cts"]) {
      assert.equal(existsSync(new URL(`${dir}server.${ext}`, root)), false, `${dir}server.${ext} would be detected as a Node server`);
    }
  }
});
