import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { BRELLA_TIMESLOTS_URL, fetchOfficialAgenda, normalizeBrella, richTextToPlain } from "../src/agenda.js";
import { clearLiveCache } from "../src/util.js";
import { BRELLA_FIXTURE, json } from "./fixtures.js";

beforeEach(() => clearLiveCache());

test("rich text: Draft.js objects, JSON strings and plain strings", () => {
  assert.equal(richTextToPlain({ blocks: [{ text: "One two" }, { text: "" }, { text: "" }, { text: "" }, { text: "Three" }] }), "One two\n\nThree");
  assert.equal(richTextToPlain(JSON.stringify({ blocks: [{ text: "Encoded" }] })), "Encoded");
  assert.equal(richTextToPlain("just   text"), "just text");
  assert.equal(richTextToPlain(null), "");
});

test("normalizeBrella keeps titled sessions, converts times to Turin and resolves speakers", () => {
  const { sessions, speakers } = normalizeBrella(BRELLA_FIXTURE);
  assert.deepEqual(
    sessions.map((s) => [s.id, s.format, s.stage, s.date, s.start, s.end]),
    [
      ["s3", "live_podcast", "Room C", "2026-10-07", "11:30", "12:00"],
      ["s2", "talk", "Fucine", "2026-10-07", "12:12", "12:57"],
      ["s4", "pitch", "Investor Lounge", "2026-10-07", "16:00", "17:00"],
      ["s1", "masterclass", "Room A", "2026-10-08", "09:30", "10:15"],
    ],
    "untitled meeting slots and invalid dates are dropped; sorted by start",
  );
  const talk = sessions.find((s) => s.id === "s2");
  assert.deepEqual(talk.speakers, [
    { id: "p10", role: "Speaker" },
    { id: "p11", role: "Speaker" },
    { id: "p12", role: "Moderator" },
  ]);
  assert.equal(talk.description, "Design, industry and taste.\n\nA conversation.");
  assert.equal(sessions.find((s) => s.id === "s1").capacity, 70);
  assert.deepEqual(
    speakers.map((s) => [s.id, s.name, s.job_title, s.company, s.bio]),
    [
      ["p11", "John Elkann", "CEO & Chairman", "Exor, Stellantis & Ferrari", null],
      ["p10", "Jony Ive", "Founder", "LoveFrom", "Designer."],
      ["p13", "Yuri Mariotti", "Fractional CAIO", null, null],
      ["p12", "Zanny Minton Beddoes", "Editor-in-Chief", "The Economist", null],
    ],
  );
});

test("fetchOfficialAgenda asks Brella's public API for the agenda and caches it", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.headers.accept]);
    return json(BRELLA_FIXTURE);
  };
  const first = await fetchOfficialAgenda({ fetchImpl });
  const second = await fetchOfficialAgenda({ fetchImpl });
  assert.equal(first, second);
  assert.equal(first.source, "live");
  assert.equal(first.sessions.length, 4);
  assert.deepEqual(calls, [[BRELLA_TIMESLOTS_URL, "application/vnd.brella.v4+json"]]);
});

test("fetchOfficialAgenda fails on HTTP errors and empty agendas", async () => {
  await assert.rejects(fetchOfficialAgenda({ fetchImpl: async () => new Response("no", { status: 503 }) }), /HTTP 503/);
  await assert.rejects(fetchOfficialAgenda({ fetchImpl: async () => json({ data: [], included: [] }) }), /no sessions/);
});
