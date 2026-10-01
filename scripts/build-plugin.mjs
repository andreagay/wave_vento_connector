#!/usr/bin/env node
// Builds the Claude plugin from /data (refresh data/agenda.json first with
// scripts/sync-agenda.mjs):
//   - regenerates the skill references (plugins/wave-by-vento/skills/wave-by-vento/references/*.md)
//   - packs dist/wave-by-vento.plugin (a zip you can upload in Claude or share)
//
// Usage:
//   node scripts/build-plugin.mjs                  regenerate everything
//   node scripts/build-plugin.mjs --check          exit 1 if generated files are stale
//   node scripts/build-plugin.mjs --mcp-url URL    also wire the plugin to a deployed connector
//   node scripts/build-plugin.mjs --no-mcp         remove the connector from the plugin
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_DAYS, SNAPSHOT, prepareAgenda } from "../src/data.js";
import { formatEventReference, formatProgramReference, formatSpeakersReference } from "../src/format.js";
import { NAME, VERSION } from "../src/version.js";
import { createZip } from "./zip.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN_DIR = join(ROOT, "plugins", "wave-by-vento");
const REFERENCES_DIR = join(PLUGIN_DIR, "skills", "wave-by-vento", "references");
const MCP_FILE = join(PLUGIN_DIR, ".mcp.json");
const PACKAGE_FILE = join(ROOT, "dist", "wave-by-vento.plugin");

const HEADER = "<!-- Generated from data/*.json by scripts/build-plugin.mjs: edit the data, not this file. -->\n\n";

export function renderReferences() {
  const agenda = prepareAgenda(SNAPSHOT);
  const files = {
    "event.md": formatEventReference(agenda),
    "speakers.md": formatSpeakersReference(agenda, SNAPSHOT.snapshot_at),
  };
  for (const day of EVENT_DAYS) files[`program-${day}.md`] = formatProgramReference(agenda, day, SNAPSHOT.snapshot_at);
  return Object.fromEntries(Object.entries(files).map(([name, body]) => [name, `${HEADER}${body}\n`]));
}

export function mcpConfig(url) {
  const parsed = new URL(url);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) throw new Error("The connector URL must use https://");
  return `${JSON.stringify({ mcpServers: { "wave-by-vento": { type: "http", url: parsed.href } } }, null, 2)}\n`;
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile() && entry.name !== ".DS_Store") out.push(full);
  }
  return out;
}

export async function packPlugin() {
  const files = (await listFiles(PLUGIN_DIR)).sort();
  const entries = await Promise.all(files.map(async (f) => ({ name: relative(PLUGIN_DIR, f).split(sep).join("/"), data: await readFile(f) })));
  return createZip(entries);
}

async function readOrNull(file) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function checkVersions() {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const plugin = JSON.parse(await readFile(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(await readFile(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
  const entry = marketplace.plugins.find((p) => p.name === plugin.name);
  const versions = { "package.json": pkg.version, "src/version.js": VERSION, "plugin.json": plugin.version, "marketplace.json": entry?.version };
  if (new Set(Object.values(versions)).size !== 1) throw new Error(`Version mismatch: ${JSON.stringify(versions)}`);
  if (pkg.name !== NAME) throw new Error(`src/version.js NAME (${NAME}) differs from package.json (${pkg.name})`);
}

async function main(argv) {
  const check = argv.includes("--check");
  const urlIndex = argv.indexOf("--mcp-url");
  await checkVersions();

  if (!check) {
    if (urlIndex !== -1) await writeFile(MCP_FILE, mcpConfig(argv[urlIndex + 1] ?? ""));
    if (argv.includes("--no-mcp")) await rm(MCP_FILE, { force: true });
  }

  const stale = [];
  const references = renderReferences();
  for (const name of await readdir(REFERENCES_DIR).catch(() => [])) {
    if (name in references) continue;
    if (check) stale.push(relative(ROOT, join(REFERENCES_DIR, name)));
    else await rm(join(REFERENCES_DIR, name));
  }
  for (const [name, content] of Object.entries(references)) {
    const file = join(REFERENCES_DIR, name);
    if ((await readOrNull(file))?.toString("utf8") === content) continue;
    if (check) stale.push(relative(ROOT, file));
    else {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }
  }

  const zip = await packPlugin();
  if (!(await readOrNull(PACKAGE_FILE))?.equals(zip)) {
    if (check) stale.push(relative(ROOT, PACKAGE_FILE));
    else {
      await mkdir(dirname(PACKAGE_FILE), { recursive: true });
      await writeFile(PACKAGE_FILE, zip);
    }
  }

  if (check && stale.length) {
    console.error(`Stale generated files (run npm run build:plugin):\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  const connector = await readOrNull(MCP_FILE);
  console.log(check ? "Plugin build is up to date." : `Plugin built: ${relative(ROOT, PACKAGE_FILE)} (${zip.length} bytes)`);
  console.log(connector ? `Connector: ${JSON.parse(connector).mcpServers["wave-by-vento"].url}` : "Connector: not configured (skill only).");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
