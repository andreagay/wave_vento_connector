import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { clearLiveCache } from "../src/live.js";
import { SERVER_INSTRUCTIONS, createServer } from "../src/server.js";

let client;
let fetchImpl = async () => {
  throw new Error("offline");
};

before(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer({ fetchImpl: (...args) => fetchImpl(...args) }).connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

after(() => client.close());
beforeEach(() => clearLiveCache());

const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  return { text: result.content.map((c) => c.text).join("\n"), isError: Boolean(result.isError) };
};

test("server exposes identity, instructions and read-only tools", async () => {
  assert.equal(client.getServerVersion().name, "wave-by-vento");
  assert.equal(client.getInstructions(), SERVER_INSTRUCTIONS);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["find_speakers", "get_event_info", "get_side_events", "read_official_page", "search_program"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.ok(t.description.length > 80, `${t.name} needs a useful description`);
  }
});

test("get_event_info returns sourced sections", async () => {
  const overview = await call("get_event_info");
  assert.match(overview.text, /7 October 2026 to Friday 9 October 2026/);
  assert.match(overview.text, /Corso Castelfidardo 22/);
  assert.match(overview.text, /Sources: \[/);

  const passes = await call("get_event_info", { topic: "passes" });
  assert.match(passes.text, /Investor pass/);
  assert.doesNotMatch(passes.text, /Getting to/);

  const all = await call("get_event_info", { topic: "all" });
  for (const heading of ["Getting to", "Passes and tickets", "Entry and badge", "Official app", "On-site services", "Side events", ".WAV: closing party", "Official links"]) {
    assert.ok(all.text.includes(heading), heading);
  }
});

test("invalid arguments are rejected", async () => {
  const bad = await call("get_event_info", { topic: "weather" });
  assert.equal(bad.isError, true);
  const badDay = await call("search_program", { day: "2026-10-10" });
  assert.equal(badDay.isError, true);
});

test("search_program flags partial data and undated sessions", async () => {
  const thursday = await call("search_program", { day: "2026-10-08" });
  assert.match(thursday.text, /AI in SMEs/);
  assert.match(thursday.text, /day is not public yet/);
  assert.match(thursday.text, /read_official_page/);

  const none = await call("search_program", { query: "quantum gaming" });
  assert.match(none.text, /No confirmed session matches/);
});

test("find_speakers searches and lists", async () => {
  const one = await call("find_speakers", { query: "Anthropic" });
  assert.match(one.text, /Dario Amodei/);
  assert.match(one.text, /Fireside chat/);
  const missing = await call("find_speakers", { query: "Jeff Bezos" });
  assert.match(missing.text, /No announced speaker matches/);
});

test("get_side_events filters live Luma data by Rome date and keyword", async () => {
  fetchImpl = async (url) => {
    if (url.includes("/url?")) return Response.json({ data: { calendar: { api_id: "cal-1" } } });
    return Response.json({
      entries: [
        { event: { api_id: "a", name: "AI Night", start_at: "2026-10-07T17:00:00.000Z", end_at: "2026-10-07T20:00:00.000Z", url: "ai" }, hosts: [{ name: "AI Club" }] },
        { event: { api_id: "b", name: "Late Founders Drinks", start_at: "2026-10-07T22:30:00.000Z", url: "late" } },
        { event: { api_id: "c", name: "Investor Breakfast", start_at: "2026-10-08T06:00:00.000Z", url: "vc" }, ticket_info: { require_approval: true } },
      ],
      has_more: false,
    });
  };
  const wednesday = await call("get_side_events", { day: "2026-10-07" });
  assert.match(wednesday.text, /^1 side event\(s\) on Wednesday 7 October 2026/);
  assert.match(wednesday.text, /\*\*AI Night\*\*: Wednesday 7 October 2026, 19:00-22:00 \| hosted by AI Club \| https:\/\/luma.com\/ai/);

  const thursday = await call("get_side_events", { day: "2026-10-08" });
  assert.match(thursday.text, /Late Founders Drinks/, "00:30 Rome time belongs to the next day");
  assert.match(thursday.text, /approval required/);

  const limited = await call("get_side_events", { limit: 1 });
  assert.match(limited.text, /2 more not shown/);
});

test("get_side_events degrades gracefully when Luma is unreachable", async () => {
  fetchImpl = async () => new Response("blocked", { status: 403 });
  const result = await call("get_side_events");
  assert.equal(result.isError, false);
  assert.match(result.text, /Live side events unavailable/);
  assert.match(result.text, /luma.com\/wave2026sideevents/);
});

test("read_official_page returns live text, or an error with the URL", async () => {
  fetchImpl = async () => new Response("<title>Agenda</title><h1>Agenda</h1><p>Fireside: Dario Amodei x John Elkann, Fucine Stage</p>", { headers: { "content-type": "text/html" } });
  const page = await call("read_official_page", { page: "agenda", find: "Amodei" });
  assert.match(page.text, /Source: https:\/\/wavebyvento.com\/agenda/);
  assert.match(page.text, /Fucine Stage/);

  clearLiveCache();
  fetchImpl = async () => new Response("down", { status: 500 });
  const failed = await call("read_official_page", { page: "faqs" });
  assert.equal(failed.isError, true);
  assert.match(failed.text, /https:\/\/wavebyvento.com\/faqs/);
});

test("plan_my_wave prompt carries the user's inputs", async () => {
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name), ["plan_my_wave"]);
  const prompt = await client.getPrompt({ name: "plan_my_wave", arguments: { profile: "fintech founder", days: "Thursday" } });
  const text = prompt.messages[0].content.text;
  assert.match(text, /Profile: fintech founder\. Interests: ask me\. Days: Thursday\./);
  assert.match(text, /\.WAV closing party/);
});
