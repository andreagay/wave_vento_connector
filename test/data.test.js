import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBrella } from "../src/agenda.js";
import { EVENT, EVENT_DAYS, EXTRAS, FORMATS, SNAPSHOT, SOURCES, findSpeakers, matchScore, prepareAgenda, searchSessions, sessionById, sessionsOfSpeaker } from "../src/data.js";
import { romeDate, romeTime } from "../src/util.js";
import { BRELLA_FIXTURE } from "./fixtures.js";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

test("event info: every section cites known sources and has content", () => {
  assert.ok(EVENT.sections.length >= 10);
  for (const section of EVENT.sections) {
    assert.ok(section.items.length > 0, section.id);
    assert.ok(section.sources.length > 0, section.id);
    for (const id of section.sources) assert.ok(SOURCES.has(id), `${section.id}: unknown source ${id}`);
  }
  for (const p of EVENT.announced_not_in_agenda) for (const id of p.sources) assert.ok(SOURCES.has(id), id);
  for (const s of EXTRAS) for (const id of s.sources) assert.ok(SOURCES.has(id), id);
});

test("all links and sources are https", () => {
  for (const url of [...Object.values(EVENT.links), ...[...SOURCES.values()].map((s) => s.url)]) assert.match(url, /^https:\/\//);
});

test("event days are 7-9 October 2026", () => {
  assert.deepEqual(EVENT_DAYS, ["2026-10-07", "2026-10-08", "2026-10-09"]);
});

test("agenda snapshot and extras are consistent", () => {
  assert.ok(SNAPSHOT.sessions.length > 50, "snapshot looks empty");
  assert.ok(!Number.isNaN(Date.parse(SNAPSHOT.snapshot_at)));
  const speakerIds = new Set(SNAPSHOT.speakers.map((s) => s.id));
  assert.equal(speakerIds.size, SNAPSHOT.speakers.length, "speaker ids are unique");
  const sessionIds = new Set();
  for (const s of [...SNAPSHOT.sessions, ...EXTRAS]) {
    assert.ok(!sessionIds.has(s.id), `duplicate id ${s.id}`);
    sessionIds.add(s.id);
    assert.ok(FORMATS.includes(s.format), `${s.id}: format ${s.format}`);
    assert.ok(EVENT_DAYS.includes(s.date), `${s.id}: date ${s.date}`);
    assert.match(s.start, TIME);
    if (s.end) assert.ok(s.start < s.end, `${s.id}: ends before it starts`);
    assert.equal(romeDate(s.starts_at), s.date, `${s.id}: starts_at and date disagree`);
    assert.equal(romeTime(s.starts_at), s.start, `${s.id}: starts_at and start disagree`);
    for (const ref of s.speakers) assert.ok(speakerIds.has(ref.id), `${s.id}: unknown speaker ${ref.id}`);
  }
});

// Search behaviour is tested on the fixture, so it does not depend on the snapshot.
const agenda = prepareAgenda(normalizeBrella(BRELLA_FIXTURE));

test("prepareAgenda adds the extras in time order", () => {
  assert.deepEqual(agenda.sessions.map((s) => s.id), ["s3", "s2", "s4", "x-vcunder35", "s1", "x-wav-closing-party"]);
  assert.equal(sessionById(agenda, "x-wav-closing-party").format, "party");
  assert.equal(sessionById(agenda, "nope"), null);
  assert.deepEqual(sessionsOfSpeaker(agenda, "p11").map((s) => s.id), ["s2"]);
});

test("searchSessions filters by day, format, stage, speaker and time", () => {
  const ids = (filters) => searchSessions(agenda, filters).map((s) => s.id);
  assert.deepEqual(ids({ day: "2026-10-08" }), ["s1"]);
  assert.deepEqual(ids({ format: "masterclass" }), ["s1"]);
  assert.deepEqual(ids({ stage: "room" }), ["s3", "s1"]);
  assert.deepEqual(ids({ stage: "fucine" }), ["s2"]);
  assert.deepEqual(ids({ speaker: "Elkann" }), ["s2"]);
  assert.deepEqual(ids({ speaker: "John Ive" }), [], "all speaker tokens must match the same person");
  assert.deepEqual(ids({ day: "2026-10-07", from: "12:00", to: "17:00" }), ["s2", "s4"]);
});

test("keyword search ranks title and speaker matches above description matches", () => {
  assert.deepEqual(searchSessions(agenda, { query: "AI" }).map((s) => s.id), ["s1"]);
  assert.deepEqual(searchSessions(agenda, { query: "Economist" }).map((s) => s.id), ["s2"], "matches the moderator's company");
  assert.deepEqual(searchSessions(agenda, { query: "conversation design" }).map((s) => s.id)[0], "s2");
  assert.deepEqual(searchSessions(agenda, { query: "the of at" }).length, agenda.sessions.length, "only filler words: no filter");
});

test("findSpeakers matches names, roles and companies, ignoring accents and case", () => {
  assert.deepEqual(findSpeakers(agenda, "ELKANN").map((s) => s.id), ["p11"]);
  assert.deepEqual(findSpeakers(agenda, "chi è il CEO di Exor").map((s) => s.id)[0], "p11", "best match first");
  assert.equal(findSpeakers(agenda).length, 4);
  assert.equal(findSpeakers(agenda, "nobody-at-all").length, 0);
  assert.equal(matchScore("Eléonore Crespo", "eleonore"), 1);
});
