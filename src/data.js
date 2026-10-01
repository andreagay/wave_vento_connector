// Wave by Vento 2026 data and search helpers.
// - data/event.json: curated practical info, each block linked to its sources
// - data/agenda.json: snapshot of the official agenda (scripts/sync-agenda.mjs)
// - data/extras.json: official-adjacent events missing from the agenda
// Search functions take an agenda object, so they work on live data and on
// the snapshot alike.
import { readFileSync } from "node:fs";

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

export const EVENT = readJson("../data/event.json");
export const SNAPSHOT = readJson("../data/agenda.json");
export const EXTRAS = readJson("../data/extras.json").sessions;
export const EVENT_DAYS = EVENT.event.days.map((d) => d.date);
export const SOURCES = new Map(EVENT.sources.map((s) => [s.id, s]));
export const FORMATS = ["talk", "masterclass", "live_podcast", "pitch", "networking", "party"];

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
const STOPWORDS = new Set([
  "about", "an", "and", "are", "at", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "with",
  "al", "alla", "alle", "allo", "che", "chi", "con", "cosa", "da", "dal", "dalla", "dei", "del", "della", "delle", "di", "dove", "ed", "fra", "gli",
  "il", "la", "le", "lo", "nel", "nella", "per", "quando", "su", "sul", "sulla", "tra", "un", "una", "uno",
]);

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

/** Adds the extras and a speaker index to an agenda ({ sessions, speakers }). */
export function prepareAgenda(agenda) {
  const sessions = [...agenda.sessions, ...EXTRAS].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
  return { ...agenda, sessions, speakersById: new Map(agenda.speakers.map((s) => [s.id, s])) };
}

const speakerText = (sp) => [sp.name, sp.job_title, sp.company].filter(Boolean).join(" ");

export function sessionSpeakers(agenda, session) {
  return session.speakers.map((ref) => ({ ...agenda.speakersById.get(ref.id), role: ref.role })).filter((s) => s.name);
}

export function sessionById(agenda, id) {
  return agenda.sessions.find((s) => s.id === id) ?? null;
}

export function sessionsOfSpeaker(agenda, speakerId) {
  return agenda.sessions.filter((s) => s.speakers.some((ref) => ref.id === speakerId));
}

/**
 * Filters sessions. Keyword matches in the title or among the speakers weigh
 * more than matches in the description, and results are sorted by relevance,
 * then by time.
 */
export function searchSessions(agenda, { query, day, format, stage, speaker, from, to } = {}) {
  let list = agenda.sessions;
  if (day) list = list.filter((s) => s.date === day);
  if (format) list = list.filter((s) => s.format === format);
  if (stage && normalize(stage).trim()) list = list.filter((s) => normalize(s.stage).includes(normalize(stage).trim()));
  if (from) list = list.filter((s) => s.start >= from);
  if (to) list = list.filter((s) => s.start < to);
  if (speaker && tokenize(speaker).length) {
    const needed = tokenize(speaker).length;
    list = list.filter((s) => sessionSpeakers(agenda, s).some((sp) => matchScore(speakerText(sp), speaker) === needed));
  }
  if (!query || !tokenize(query).length) return list;
  return list
    .map((s) => {
      const strong = `${s.title} ${sessionSpeakers(agenda, s).map(speakerText).join(" ")}`;
      const weak = `${s.description ?? ""} ${s.stage ?? ""} ${s.format.replace("_", " ")}`;
      const score = tokenize(query).reduce((sum, t) => sum + (matchScore(strong, t) ? 2 : matchScore(weak, t) ? 1 : 0), 0);
      return { s, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.s.starts_at.localeCompare(b.s.starts_at))
    .map((r) => r.s);
}

export function findSpeakers(agenda, query) {
  if (!query || !tokenize(query).length) return agenda.speakers;
  return agenda.speakers
    .map((sp) => ({ sp, score: matchScore(speakerText(sp), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.sp.name.localeCompare(b.sp.name))
    .map((r) => r.sp);
}
