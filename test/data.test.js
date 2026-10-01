import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENT, EVENT_DAYS, SESSIONS, SESSION_TYPES, SOURCES, SPEAKERS, findSpeakers, getSpeaker, searchProgram } from "../src/data.js";

function collectSourceIds(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => collectSourceIds(n, out));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "sources" && Array.isArray(value) && value.every((v) => typeof v === "string")) out.push(...value);
      else collectSourceIds(value, out);
    }
  }
  return out;
}

test("every referenced source id exists", () => {
  const referenced = collectSourceIds([EVENT, SPEAKERS, SESSIONS]);
  assert.ok(referenced.length > 20);
  for (const id of referenced) assert.ok(SOURCES.has(id), `unknown source id: ${id}`);
});

test("every fact block, speaker and session cites at least one source", () => {
  for (const s of SPEAKERS) assert.ok(s.sources.length > 0, s.id);
  for (const s of SESSIONS) assert.ok(s.sources.length > 0, s.id);
  for (const key of ["event", "numbers", "venue", "stages", "getting_there", "passes", "access", "official_app", "on_site", "side_events", "closing_party"]) {
    assert.ok(EVENT[key].sources.length > 0, key);
  }
});

test("all links are https", () => {
  const urls = [...Object.values(EVENT.links), ...EVENT.event.sources.map((id) => SOURCES.get(id).url), ...[...SOURCES.values()].map((s) => s.url)];
  for (const url of urls) assert.match(url, /^https:\/\//);
});

test("event days are 7-9 October 2026", () => {
  assert.deepEqual(EVENT_DAYS, ["2026-10-07", "2026-10-08", "2026-10-09"]);
  assert.equal(EVENT.event.start_date, EVENT_DAYS[0]);
  assert.equal(EVENT.event.end_date, EVENT_DAYS.at(-1));
});

test("sessions are well formed", () => {
  const ids = new Set();
  for (const s of SESSIONS) {
    assert.ok(!ids.has(s.id), `duplicate session id ${s.id}`);
    ids.add(s.id);
    assert.ok(SESSION_TYPES.includes(s.type), `${s.id}: unknown type ${s.type}`);
    assert.ok(s.date === null || EVENT_DAYS.includes(s.date), `${s.id}: date outside the event`);
    for (const t of [s.start, s.end]) assert.ok(t === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(t), `${s.id}: bad time ${t}`);
    if (s.start && s.end) assert.ok(s.start < s.end, `${s.id}: ends before it starts`);
    if (s.date === null) assert.equal(s.start, null, `${s.id}: time without a date`);
    for (const id of s.speakers) assert.ok(getSpeaker(id), `${s.id}: unknown speaker ${id}`);
  }
});

test("speaker ids are unique", () => {
  assert.equal(new Set(SPEAKERS.map((s) => s.id)).size, SPEAKERS.length);
});

test("searchProgram finds sessions by keyword, speaker, type and day", () => {
  assert.deepEqual(searchProgram({ query: "Amodei" }).sessions.map((s) => s.id), ["amodei-elkann-fireside"]);
  assert.deepEqual(searchProgram({ speaker: "Mariotti" }).sessions.map((s) => s.id), ["masterclass-ai-in-smes"]);
  assert.deepEqual(searchProgram({ type: "party" }).sessions.map((s) => s.id), ["wav-closing-party"]);

  const thursday = searchProgram({ day: "2026-10-08" });
  assert.deepEqual(thursday.sessions.map((s) => s.id), ["masterclass-ai-in-smes"]);
  assert.deepEqual(thursday.undated.map((s) => s.id), ["amodei-elkann-fireside"], "undated sessions are reported separately, not placed on the day");

  assert.equal(searchProgram({ query: "blockchain gaming" }).sessions.length, 0);
});

test("searchProgram without filters returns everything in schedule order, undated last", () => {
  const ids = searchProgram().sessions.map((s) => s.id);
  assert.deepEqual(ids, ["vcunder35-networking", "masterclass-ai-in-smes", "wav-closing-party", "amodei-elkann-fireside"]);
});

test("findSpeakers ignores accents and case", () => {
  assert.deepEqual(findSpeakers("eleonore").map((s) => s.id), ["eleonore-crespo"]);
  assert.deepEqual(findSpeakers("SEQUOIA").map((s) => s.id), ["anas-biad"]);
  assert.equal(findSpeakers().length, SPEAKERS.length);
  assert.equal(findSpeakers("nobody-at-all").length, 0);
});

test("matching works on word starts and ignores filler words, but keeps AI", () => {
  assert.equal(findSpeakers("chi è il CEO di Revolut")[0].id, "nik-storonsky", "best match first");
  assert.deepEqual(searchProgram({ query: "AI" }).sessions.map((s) => s.id), ["masterclass-ai-in-smes"]);
  assert.deepEqual(searchProgram({ query: "SME" }).sessions.map((s) => s.id), ["masterclass-ai-in-smes"], "prefix of SMEs");
  assert.equal(searchProgram({ query: "the of at" }).sessions.length, 4, "a query of filler words is no filter");
});
