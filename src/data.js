// Curated Wave by Vento 2026 dataset and search helpers.
// The JSON files in /data are the single source of truth for both the MCP
// connector and the generated skill references in the Claude plugin.
import { readFileSync } from "node:fs";

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const event = readJson("../data/event.json");
const speakersData = readJson("../data/speakers.json");
const programData = readJson("../data/program.json");

export const EVENT = event;
export const SPEAKERS = speakersData.speakers;
export const SPEAKERS_META = { last_verified: speakersData.last_verified, complete: speakersData.complete, note: speakersData.note };
export const SESSIONS = programData.sessions;
export const PROGRAM_META = { last_verified: programData.last_verified, complete: programData.complete, note: programData.note };
export const SESSION_TYPES = programData.types;
export const EVENT_DAYS = event.event.days.map((d) => d.date);
export const SOURCES = new Map(event.sources.map((s) => [s.id, s]));

const speakersById = new Map(SPEAKERS.map((s) => [s.id, s]));

export function getSpeaker(id) {
  return speakersById.get(id);
}

export function sessionsForSpeaker(id) {
  return SESSIONS.filter((s) => s.speakers.includes(id));
}

export function sourceList(ids) {
  return ids.map((id) => SOURCES.get(id)).filter(Boolean);
}

export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// English and Italian function words that would match almost anything
// ("ai" and "it" are kept on purpose: they mean AI and IT here).
const STOPWORDS = new Set(
  [
    "about", "an", "and", "are", "at", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "with",
    "al", "alla", "alle", "allo", "che", "chi", "con", "cosa", "da", "dal", "dalla", "dei", "del", "della", "delle", "di", "dove", "ed", "fra", "gli",
    "il", "la", "le", "lo", "nel", "nella", "per", "quando", "su", "sul", "sulla", "tra", "un", "una", "uno",
  ],
);

const words = (text) => normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function tokenize(query) {
  return words(query).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// Number of query tokens that start a word of the haystack (0 when nothing matches).
export function matchScore(haystack, query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  const hay = words(haystack);
  return tokens.filter((t) => hay.some((w) => w.startsWith(t))).length;
}

function speakerHaystack(speaker) {
  return [speaker.name, speaker.role, speaker.organization, speaker.highlight].filter(Boolean).join(" ");
}

function sessionHaystack(session) {
  const people = session.speakers.map((id) => getSpeaker(id)).filter(Boolean).map(speakerHaystack);
  return [
    session.title,
    session.type,
    session.description,
    session.location,
    ...(session.lineup ?? []),
    ...(session.organizers ?? []),
    ...people,
  ]
    .filter(Boolean)
    .join(" ");
}

function bySchedule(a, b) {
  const ka = `${a.date ?? "9999"} ${a.start ?? "99:99"}`;
  const kb = `${b.date ?? "9999"} ${b.start ?? "99:99"}`;
  return ka.localeCompare(kb);
}

export function findSpeakers(query) {
  if (!query || tokenize(query).length === 0) return [...SPEAKERS];
  return SPEAKERS.map((s) => ({ s, score: matchScore(speakerHaystack(s), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.s);
}

/**
 * Filters the curated program. Sessions whose date is not public yet never
 * match a `day` filter; they are returned separately in `undated` so callers
 * can mention them without placing them on the wrong day.
 */
export function searchProgram({ query, day, type, speaker } = {}) {
  let candidates = [...SESSIONS];
  if (type) candidates = candidates.filter((s) => s.type === type);
  if (speaker && tokenize(speaker).length > 0) {
    candidates = candidates.filter((s) =>
      s.speakers.some((id) => {
        const sp = getSpeaker(id);
        return sp && matchScore(`${sp.name} ${sp.organization ?? ""}`, speaker) === tokenize(speaker).length;
      }),
    );
  }
  if (query && tokenize(query).length > 0) {
    candidates = candidates
      .map((s) => ({ s, score: matchScore(sessionHaystack(s), query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || bySchedule(a.s, b.s))
      .map((r) => r.s);
  } else {
    candidates.sort(bySchedule);
  }
  if (!day) return { sessions: candidates, undated: [] };
  return {
    sessions: candidates.filter((s) => s.date === day),
    undated: candidates.filter((s) => s.date === null),
  };
}
