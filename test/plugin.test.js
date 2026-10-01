import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { mcpConfig, packPlugin } from "../scripts/build-plugin.mjs";
import { createZip, crc32 } from "../scripts/zip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

// Reads entries back through the central directory, like an unzip tool would.
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(crc32(data), crc, `${name}: CRC mismatch`);
    files[name] = data.toString("utf8");
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return files;
}

test("generated references and dist/wave-by-vento.plugin are up to date", () => {
  execFileSync(process.execPath, ["scripts/build-plugin.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("manifests agree with each other and with package.json", () => {
  const pkg = readJson("package.json");
  const plugin = readJson("plugins/wave-by-vento/.claude-plugin/plugin.json");
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const entry = marketplace.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, "plugin listed in the marketplace");
  assert.equal(entry.source, "./plugins/wave-by-vento");
  assert.equal(entry.version, plugin.version);
  assert.equal(plugin.version, pkg.version);
});

test("skill frontmatter is valid", () => {
  const skill = readFileSync(new URL("../plugins/wave-by-vento/skills/wave-by-vento/SKILL.md", import.meta.url), "utf8");
  const match = /^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/.exec(skill);
  assert.ok(match, "frontmatter with name and description");
  assert.equal(match[1], "wave-by-vento");
  assert.ok(match[2].length <= 1024, "description fits the 1024-character limit");
});

test("packed plugin holds the manifest at its root plus the skill", async () => {
  const files = unzip(await packPlugin());
  assert.deepEqual(Object.keys(files).sort().slice(0, 2), [".claude-plugin/plugin.json", "skills/wave-by-vento/SKILL.md"]);
  assert.equal(JSON.parse(files[".claude-plugin/plugin.json"]).name, "wave-by-vento");
  assert.match(files["skills/wave-by-vento/references/event.md"], /Corso Castelfidardo 22/);
  for (const day of ["2026-10-07", "2026-10-08", "2026-10-09"]) assert.match(files[`skills/wave-by-vento/references/program-${day}.md`], /\[s\d+\]/);
  assert.match(files["skills/wave-by-vento/references/speakers.md"], /Sessions: /);
  assert.ok(!("skills/wave-by-vento/references/program.md" in files), "old references are removed");
});

test("zip writer round-trips content and is deterministic", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const entries = [
    { name: "a.txt", data: Buffer.from("hello ".repeat(100)) },
    { name: "dir/è.md", data: Buffer.from("x") },
  ];
  const zip = createZip(entries);
  assert.deepEqual(unzip(zip), { "a.txt": "hello ".repeat(100), "dir/è.md": "x" });
  assert.ok(zip.equals(createZip(entries)));
});

test("connector URL must be https (localhost allowed for testing)", () => {
  assert.deepEqual(JSON.parse(mcpConfig("https://wave.example.com/mcp")), { mcpServers: { "wave-by-vento": { type: "http", url: "https://wave.example.com/mcp" } } });
  assert.ok(mcpConfig("http://localhost:3000/mcp"));
  assert.throws(() => mcpConfig("http://wave.example.com/mcp"), /https/);
  assert.throws(() => mcpConfig("not a url"));
});
