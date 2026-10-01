import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  clearLiveCache,
  collectLumaEvents,
  eventsFromJsonLd,
  extractJsonLd,
  extractNextData,
  fetchSideEvents,
  htmlToText,
  readOfficialPage,
  romeDate,
  romeTime,
  stripBoilerplate,
} from "../src/live.js";
import { html, json } from "./fixtures.js";

beforeEach(() => clearLiveCache());

// Shape of Luma's calendar endpoints (entries wrap the event, hosts and tickets).
const LUMA_ITEMS = {
  entries: [
    {
      api_id: "calev-2",
      event: { api_id: "evt-2", name: "Founders Breakfast", start_at: "2026-10-08T05:30:00.000Z", end_at: "2026-10-08T07:30:00.000Z", url: "breakfast26", geo_address_info: { full_address: "Via Roma 1, Torino" } },
      hosts: [{ name: "Torino Founders" }],
      ticket_info: { require_approval: true, is_free: true },
    },
    {
      api_id: "calev-1",
      event: { api_id: "evt-1", name: "AI Night", start_at: "2026-10-07T17:00:00.000Z", end_at: "2026-10-07T20:00:00.000Z", url: "ainight", geo_address_info: { city: "Torino" } },
      hosts: [{ name: "AI Club" }],
    },
  ],
  has_more: false,
  next_cursor: null,
};

const NEXT_PAGE = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { initialData: { data: { featured_items: LUMA_ITEMS.entries, calendar: { name: "Wave 2026 side events" } } } } },
})}</script></body></html>`;

test("htmlToText keeps visible text and structure, drops navigation, scripts and styles", () => {
  const text = htmlToText(`<html><head><title>T</title><style>.a{}</style></head><body>
    <nav role="navigation"><a href="/">Home</a><a href="/agenda">Agenda</a></nav><h2>Day 1 &amp; Day 2</h2><p>Masterclass&nbsp;with&#160;Yuri &#x2014; OGR</p>
    <script>alert("x")</script><ul><li>One</li><li>Two</li></ul><p>‍</p><p>Same</p><p>Same</p></body></html>`);
  assert.equal(text, "## Day 1 & Day 2\nMasterclass with Yuri — OGR\n- One\n- Two\nSame");
});

test("stripBoilerplate drops repeated marquee lines and the site footer", () => {
  const page = ["GET YOUR PASS", "OCTOBER 7-9, 2026", "TURIN, ITALY", "OCTOBER 7-9, 2026", "TURIN, ITALY", "OCTOBER 7-9, 2026", "TURIN, ITALY", "## FAQs", "Q?", "A.", "ORGANIZED BY", "Newsletter"].join("\n");
  assert.equal(stripBoilerplate(page), ["GET YOUR PASS", "OCTOBER 7-9, 2026", "TURIN, ITALY", "## FAQs", "Q?", "A."].join("\n"));
});

test("JSON-LD events are extracted", () => {
  const page = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"MusicEvent","name":".WAV","startDate":"2026-10-09T22:00:00+02:00","location":{"name":"OGR Torino"},"performer":[{"name":"Octavio Octavio"}]}]}</script><script type="application/ld+json">{broken</script>`;
  const events = eventsFromJsonLd(extractJsonLd(page));
  assert.deepEqual(events, [{ title: ".WAV", start: "2026-10-09T22:00:00+02:00", end: null, location: "OGR Torino", url: null, performers: ["Octavio Octavio"] }]);
});

test("Luma events are collected from API entries and from __NEXT_DATA__ alike", () => {
  const fromApi = collectLumaEvents(LUMA_ITEMS.entries);
  const fromPage = collectLumaEvents(extractNextData(NEXT_PAGE));
  assert.deepEqual(fromApi, fromPage);
  assert.deepEqual(
    fromApi.map((e) => [e.title, e.url, e.location, e.hosts, e.requires_approval]),
    [
      ["AI Night", "https://luma.com/ainight", "Torino", ["AI Club"], null],
      ["Founders Breakfast", "https://luma.com/breakfast26", "Via Roma 1, Torino", ["Torino Founders"], true],
    ],
  );
});

test("Rome dates and times are computed in CEST", () => {
  assert.equal(romeDate("2026-10-07T22:30:00.000Z"), "2026-10-08");
  assert.equal(romeTime("2026-10-07T17:00:00.000Z"), "19:00");
});

test("fetchSideEvents uses the Luma API, paginates and sorts", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/url?url=wave2026sideevents")) return json({ kind: "calendar", data: { calendar: { api_id: "cal-abc" } } });
    if (url.includes("pagination_cursor=next1")) return json({ entries: [LUMA_ITEMS.entries[1]], has_more: false });
    if (url.includes("/calendar/get-items")) return json({ entries: [LUMA_ITEMS.entries[0]], has_more: true, next_cursor: "next1" });
    throw new Error(`unexpected ${url}`);
  };
  const result = await fetchSideEvents({ fetchImpl });
  assert.equal(result.source, "luma-api");
  assert.deepEqual(result.events.map((e) => e.title), ["AI Night", "Founders Breakfast"]);
  assert.ok(calls.every((u) => u.startsWith("https://api.lu.ma/")));
  assert.ok(calls.some((u) => u.includes("calendar_api_id=cal-abc")));
});

test("fetchSideEvents falls back to the calendar page, then reports both failures", async () => {
  const pageOnly = async (url) => (url.startsWith("https://luma.com/") ? html(NEXT_PAGE) : new Response("nope", { status: 403 }));
  const result = await fetchSideEvents({ fetchImpl: pageOnly });
  assert.equal(result.source, "luma-page");
  assert.equal(result.events.length, 2);

  clearLiveCache();
  await assert.rejects(fetchSideEvents({ fetchImpl: async () => new Response("down", { status: 503 }) }), /luma-api: HTTP 503.*luma-page: HTTP 503/);
});

test("results are cached, failures are not", async () => {
  let n = 0;
  const flaky = async () => {
    n++;
    if (n === 1) throw new Error("network down");
    return html("<h1>FAQs</h1><p>Entry needs an ID</p>");
  };
  await assert.rejects(readOfficialPage("faqs", { fetchImpl: flaky }), /network down/);
  const first = await readOfficialPage("faqs", { fetchImpl: flaky });
  const second = await readOfficialPage("faqs", { fetchImpl: flaky });
  assert.equal(first.text, "# FAQs\nEntry needs an ID");
  assert.equal(second.text, first.text);
  assert.equal(n, 2);
});

test("readOfficialPage filters lines with find and truncates long pages", async () => {
  const lines = Array.from({ length: 40 }, (_, i) => `<p>Line ${i}</p>`);
  lines[20] = "<p>Badge kiosks open a few days before</p>";
  const fetchImpl = async () => html(`<title>FAQs | Wave</title>${lines.join("")}`);

  const found = await readOfficialPage("faqs", { find: "badge", fetchImpl });
  assert.equal(found.title, "FAQs | Wave");
  assert.equal(found.matched_lines, 1);
  assert.equal(found.text, ["Line 18", "Line 19", "Badge kiosks open a few days before", "Line 21", "Line 22", "Line 23"].join("\n"));

  const none = await readOfficialPage("faqs", { find: "parachute", fetchImpl });
  assert.equal(none.matched_lines, 0);

  assert.equal((await readOfficialPage("faqs", { maxChars: 1000, fetchImpl })).truncated, false);
  const tiny = await readOfficialPage("faqs", { maxChars: 30, fetchImpl });
  assert.equal(tiny.truncated, true);
  assert.ok(tiny.text.endsWith("[...truncated]"));

  await assert.rejects(readOfficialPage("agenda", { fetchImpl }), /Unknown page/, "the agenda has its own tools");
});

test("WAVE_OFFLINE=1 skips the network", async () => {
  process.env.WAVE_OFFLINE = "1";
  try {
    await assert.rejects(readOfficialPage("faqs", { fetchImpl: async () => html("<p>x</p>") }), /offline mode/);
  } finally {
    delete process.env.WAVE_OFFLINE;
  }
});
