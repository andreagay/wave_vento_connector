import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SNAPSHOT } from "../src/data.js";
import { SERVER_INSTRUCTIONS, createServer } from "../src/mcp-server.js";
import { clearLiveCache } from "../src/util.js";
import { BRELLA_FIXTURE, html, json } from "./fixtures.js";

const LUMA = {
  entries: [
    { event: { api_id: "a", name: "AI Night", start_at: "2026-10-07T17:00:00.000Z", end_at: "2026-10-07T20:00:00.000Z", url: "ai" }, hosts: [{ name: "AI Club" }] },
    { event: { api_id: "b", name: "Late Founders Drinks", start_at: "2026-10-07T22:30:00.000Z", url: "late" } },
    { event: { api_id: "c", name: "Investor Breakfast", start_at: "2026-10-08T06:00:00.000Z", url: "vc" }, ticket_info: { require_approval: true } },
  ],
  has_more: false,
};

// Routes requests like the real services would answer them.
function onlineFetch(url) {
  if (url.startsWith("https://api.brella.io/")) return json(BRELLA_FIXTURE);
  if (url.includes("/url?url=")) return json({ data: { calendar: { api_id: "cal-1" } } });
  if (url.includes("/calendar/get-items")) return json(LUMA);
  if (url.startsWith("https://wavebyvento.com/faqs")) return html("<title>FAQs</title><nav>Menu</nav><h2>FAQs</h2><p>Badges are printed at the kiosks.</p><p>Streaming on YouTube.</p>");
  return new Response("not found", { status: 404 });
}

let fetchImpl = onlineFetch;
let client;

before(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer({ fetchImpl: async (url) => fetchImpl(url) }).connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

after(() => client.close());
beforeEach(() => {
  clearLiveCache();
  fetchImpl = onlineFetch;
});

const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  return { text: result.content.map((c) => c.text).join("\n"), isError: Boolean(result.isError) };
};

test("server exposes identity, instructions and read-only tools", async () => {
  assert.equal(client.getServerVersion().name, "wave-by-vento");
  assert.equal(client.getInstructions(), SERVER_INSTRUCTIONS);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["find_speakers", "get_event_info", "get_session", "get_side_events", "read_official_page", "search_program"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.ok(t.description.length > 80, `${t.name} needs a useful description`);
  }
});

test("search_program reads the live official agenda", async () => {
  const design = await call("search_program", { query: "design" });
  assert.match(design.text, /^1 session\(s\) found \(source: live official agenda, fetched /);
  assert.match(design.text, /\*\*Wed 7 Oct 12:12-12:57 \| Fucine \| Talk\*\*: Designing the World We Live In \[s2\]/);
  assert.match(design.text, /Jony Ive \(Founder, LoveFrom\); John Elkann \(CEO & Chairman, Exor, Stellantis & Ferrari\); Zanny Minton Beddoes \(moderator; Editor-in-Chief, The Economist\)/);

  const thursday = await call("search_program", { day: "2026-10-08" });
  assert.match(thursday.text, /AI in SMEs/);
  assert.doesNotMatch(thursday.text, /Designing/);

  const limited = await call("search_program", { day: "2026-10-07", limit: 2 });
  assert.match(limited.text, /2 more not shown/);
});

test("search_program falls back to the snapshot when the live agenda is down", async () => {
  fetchImpl = (url) => (url.startsWith("https://api.brella.io/") ? new Response("down", { status: 503 }) : onlineFetch(url));
  const party = await call("search_program", { format: "party" });
  assert.match(party.text, new RegExp(`source: official agenda snapshot of ${SNAPSHOT.snapshot_at} \\(live agenda unavailable: HTTP 503`));
  assert.match(party.text, /\.WAV by Recall: official closing party \[x-wav-closing-party\]/);
});

test("search_program explains speakers announced but missing from the agenda", async () => {
  const amodei = await call("search_program", { query: "Dario Amodei" });
  assert.match(amodei.text, /No session matches/);
  assert.match(amodei.text, /Dario Amodei: Co-founder & CEO of Anthropic, announced in February 2026.*Not in the official agenda/);
});

test("get_session returns full details, or an error for unknown ids", async () => {
  const s = await call("get_session", { id: "s1" });
  assert.match(s.text, /## AI in SMEs: three impacts no one saw coming/);
  assert.match(s.text, /When: Thursday 8 October 2026, 09:30-10:15/);
  assert.match(s.text, /Capacity: 70 seats/);
  assert.match(s.text, /book a seat in the official app/);
  assert.match(s.text, /Practical AI for small companies\./);

  const talk = await call("get_session", { id: "s2" });
  assert.match(talk.text, /\*\*Jony Ive \(Founder, LoveFrom\)\*\*: Designer\./);

  const party = await call("get_session", { id: "x-wav-closing-party" });
  assert.match(party.text, /reserve your spot on DICE/);
  assert.match(party.text, /Sources: \[/);

  const missing = await call("get_session", { id: "s999" });
  assert.equal(missing.isError, true);
});

test("find_speakers lists sessions, adds bios for few matches and notes absent speakers", async () => {
  const ive = await call("find_speakers", { query: "Ive" });
  assert.match(ive.text, /\*\*Jony Ive\*\*: Founder, LoveFrom\. Designer\. Sessions: Wed 7 Oct 12:12 Fucine, "Designing the World We Live In" \[s2\]\./);

  const all = await call("find_speakers", { limit: 2 });
  assert.match(all.text, /^4 speaker\(s\) out of 4/);
  assert.match(all.text, /2 more not shown/);

  const amodei = await call("find_speakers", { query: "Amodei" });
  assert.match(amodei.text, /No speaker in the official agenda matches "Amodei"/);
  assert.match(amodei.text, /Not in the official agenda or speaker list as of 2026-10-01/);
});

test("get_event_info returns sourced sections, with live agenda numbers in the overview", async () => {
  const overview = await call("get_event_info");
  assert.match(overview.text, /Official agenda: 4 sessions \(1 talks on the Fucine and Binario 3 stages, 1 masterclasses, 1 live podcasts, 1 pitch sessions\) with 4 speakers\. Program hours: Wed 7 Oct 11:30-17:00, Thu 8 Oct 09:30-10:15\./);
  assert.match(overview.text, /Dario Amodei .* not in the official agenda/);
  assert.match(overview.text, /Sources: \[/);

  const passes = await call("get_event_info", { topic: "passes" });
  assert.match(passes.text, /General EUR 500, Startup EUR 230, Investor EUR 700/);
  assert.match(passes.text, /VIP EUR 900 is sold out/);
  assert.doesNotMatch(passes.text, /Getting to/);

  const all = await call("get_event_info", { topic: "all" });
  for (const heading of ["Getting to OGR Torino", "Passes and tickets", "Entry and badge", "Official app", "Networking", "Live streaming", "Side events", ".WAV closing party", "Enjoy Turin", "Official links"]) {
    assert.ok(all.text.includes(`## ${heading}`), heading);
  }

  const bad = await call("get_event_info", { topic: "weather" });
  assert.equal(bad.isError, true);
});

test("get_side_events filters live Luma data by Rome date and keyword", async () => {
  const wednesday = await call("get_side_events", { day: "2026-10-07" });
  assert.match(wednesday.text, /^1 side event\(s\) on Wednesday 7 October 2026/);
  assert.match(wednesday.text, /\*\*AI Night\*\*: Wednesday 7 October 2026, 19:00-22:00 \| hosted by AI Club \| https:\/\/luma.com\/ai/);
  assert.match(wednesday.text, /except for side events at OGR/);

  const thursday = await call("get_side_events", { day: "2026-10-08" });
  assert.match(thursday.text, /Late Founders Drinks/, "00:30 Rome time belongs to the next day");
  assert.match(thursday.text, /approval required/);

  const keyword = await call("get_side_events", { query: "investor" });
  assert.match(keyword.text, /^1 side event\(s\) matching "investor"/);

  fetchImpl = async () => new Response("blocked", { status: 403 });
  clearLiveCache();
  const offline = await call("get_side_events");
  assert.equal(offline.isError, false);
  assert.match(offline.text, /Live side events unavailable/);
  assert.match(offline.text, /luma.com\/wave2026sideevents/);
});

test("read_official_page returns cleaned live text, or an error with the URL", async () => {
  const page = await call("read_official_page", { page: "faqs", find: "badge" });
  assert.match(page.text, /Source: https:\/\/wavebyvento.com\/faqs/);
  assert.match(page.text, /Badges are printed at the kiosks\./);
  assert.doesNotMatch(page.text, /Menu/);

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
