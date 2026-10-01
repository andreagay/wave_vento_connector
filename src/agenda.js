// Official Wave by Vento agenda. wavebyvento.com/agenda embeds a Brella
// widget (join code "wavebyvento2026") that reads Brella's public API; we read
// the same public endpoint and normalise it. A snapshot of the result lives in
// data/agenda.json (scripts/sync-agenda.mjs) and is used when Brella is down.
import { cached, fetchOk, romeDate, romeTime } from "./util.js";

export const BRELLA_JOIN_CODE = "wavebyvento2026";
export const BRELLA_TIMESLOTS_URL = `https://api.brella.io/api/public/events/${BRELLA_JOIN_CODE}/timeslots?date=all`;
const BRELLA_ACCEPT = "application/vnd.brella.v4+json";

const clean = (s) => (typeof s === "string" ? s.replace(/[\s ]+/g, " ").trim() : "");

// Brella rich text is Draft.js: { blocks: [{ text }] }, sometimes JSON-encoded.
export function richTextToPlain(value) {
  let doc = value;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return clean(doc);
    }
  }
  if (!doc || !Array.isArray(doc.blocks)) return "";
  return doc.blocks
    .map((b) => (typeof b?.text === "string" ? b.text.replace(/ /g, " ").trim() : ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatOf(tags, title) {
  if (tags.includes("Masterclass")) return "masterclass";
  if (tags.includes("Podcast")) return "live_podcast";
  if (/^pitch session/i.test(title)) return "pitch";
  return "talk";
}

/**
 * Turns Brella's JSON:API timeslots payload into { sessions, speakers }.
 * Untitled timeslots are bookable meeting slots in the lounges, not sessions.
 */
export function normalizeBrella(payload) {
  const included = new Map((payload?.included ?? []).map((i) => [`${i.type}:${i.id}`, i]));
  const ref = (rel) => (rel ? included.get(`${rel.type}:${rel.id}`) : undefined);
  const speakers = new Map();
  const sessions = [];

  for (const slot of payload?.data ?? []) {
    const a = slot.attributes ?? {};
    const title = clean(a.title);
    if (!title || !a["start-time"] || Number.isNaN(Date.parse(a["start-time"]))) continue;
    const rel = slot.relationships ?? {};
    const tags = (rel.tags?.data ?? []).map(ref).map((t) => t?.attributes?.name).filter(Boolean);
    const people = (rel["speaker-assignments"]?.data ?? [])
      .map(ref)
      .filter(Boolean)
      .sort((x, y) => (x.attributes?.position ?? 0) - (y.attributes?.position ?? 0))
      .map((assignment) => {
        const sp = ref(assignment.relationships?.speaker?.data);
        if (!sp) return null;
        const s = sp.attributes ?? {};
        const id = `p${sp.id}`;
        if (!speakers.has(id)) {
          speakers.set(id, {
            id,
            name: [s.honorific, s["first-name"], s["middle-name"], s["last-name"]].map(clean).filter(Boolean).join(" "),
            job_title: clean(s["job-title"]) || null,
            company: clean(s["company-name"]) || null,
            bio: richTextToPlain(s.bio) || null,
          });
        }
        return { id, role: clean(assignment.attributes?.role) || "Speaker" };
      })
      .filter(Boolean);
    const end = a["end-time"] && !Number.isNaN(Date.parse(a["end-time"])) ? a["end-time"] : null;
    sessions.push({
      id: `s${slot.id}`,
      title,
      format: formatOf(tags, title),
      stage: clean(a.location) || null,
      date: romeDate(a["start-time"]),
      start: romeTime(a["start-time"]),
      end: end ? romeTime(end) : null,
      starts_at: new Date(a["start-time"]).toISOString(),
      description: richTextToPlain(a.content) || null,
      capacity: Number.isInteger(a["attendance-cap"]) ? a["attendance-cap"] : null,
      speakers: people,
    });
  }

  sessions.sort((x, y) => x.starts_at.localeCompare(y.starts_at) || (x.stage ?? "").localeCompare(y.stage ?? "") || x.title.localeCompare(y.title));
  return {
    sessions,
    speakers: [...speakers.values()].sort((x, y) => x.name.localeCompare(y.name)),
  };
}

export async function fetchOfficialAgenda({ fetchImpl = globalThis.fetch } = {}) {
  return cached("agenda", async () => {
    const res = await fetchOk(fetchImpl, BRELLA_TIMESLOTS_URL, BRELLA_ACCEPT, 15000);
    const agenda = normalizeBrella(await res.json());
    if (!agenda.sessions.length) throw new Error("the official agenda returned no sessions");
    return { source: "live", fetched_at: new Date().toISOString(), ...agenda };
  });
}
