// Opt-in checks against the real services (npm run test:live). They catch
// upstream format changes in Brella, Luma or the official website.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchOfficialAgenda } from "../src/agenda.js";
import { EVENT_DAYS, FORMATS } from "../src/data.js";
import { fetchSideEvents, readOfficialPage } from "../src/live.js";

const skip = process.env.WAVE_LIVE_TESTS !== "1" && "set WAVE_LIVE_TESTS=1 to run against the real services";

test("official agenda from Brella", { skip }, async () => {
  const agenda = await fetchOfficialAgenda();
  assert.ok(agenda.sessions.length >= 50, `only ${agenda.sessions.length} sessions`);
  assert.ok(agenda.speakers.length >= 50, `only ${agenda.speakers.length} speakers`);
  for (const s of agenda.sessions) {
    assert.ok(EVENT_DAYS.includes(s.date), `${s.id} on ${s.date}`);
    assert.ok(FORMATS.includes(s.format));
  }
  assert.ok(agenda.sessions.some((s) => s.format === "masterclass"), "masterclasses are tagged");
});

test("side events from Luma", { skip }, async () => {
  const { events, source } = await fetchSideEvents();
  assert.equal(source, "luma-api");
  assert.ok(events.length >= 10, `only ${events.length} side events`);
  // Most entries link to luma.com; external events link to their own page.
  assert.ok(events.every((e) => e.title && !Number.isNaN(Date.parse(e.start)) && /^https?:\/\//.test(e.url ?? "")));
  assert.ok(events.filter((e) => e.url.startsWith("https://luma.com/")).length > events.length / 2);
});

test("official FAQ page", { skip }, async () => {
  const page = await readOfficialPage("faqs", { find: "badge" });
  assert.ok(page.matched_lines > 0, "the FAQ still mentions badges");
  assert.doesNotMatch(page.text, /ORGANIZED BY/);
});
