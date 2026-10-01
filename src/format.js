// Markdown renderers shared by the MCP tools and the generated skill references.
import { EVENT, EVENT_DAYS, sessionSpeakers, sessionsOfSpeaker, sourceList } from "./data.js";

export const INFO_TOPICS = [...EVENT.sections.map((s) => s.id), "links", "all"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FORMAT_LABELS = { talk: "Talk", masterclass: "Masterclass", live_podcast: "Live podcast", pitch: "Pitch session", networking: "Networking", party: "Party" };

function dateParts(date) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

export function formatDate(date) {
  const { y, m, d, weekday } = dateParts(date);
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}`;
}

export function shortDate(date) {
  const { m, d, weekday } = dateParts(date);
  return `${weekday.slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

const timeRange = (s) => (s.end ? `${s.start}-${s.end}` : `from ${s.start}`);
const bullets = (items) => items.map((i) => `- ${i}`).join("\n");

export function formatSources(ids) {
  const links = sourceList(ids).map((s) => `[${s.title}](${s.url})`);
  return links.length ? `Sources: ${links.join("; ")}` : "";
}

export const footer = () =>
  `_Checked against official sources on ${EVENT.last_verified}. ${EVENT.disclaimer} Times are ${EVENT.event.timezone} (${EVENT.event.utc_offset})._`;

function truncate(text, max) {
  if (!text || text.length <= max) return text ?? "";
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}...`;
}

const oneLine = (text) => (text ?? "").replace(/\s+/g, " ").trim();

/** Counts and daily time spans of an agenda, for overviews. */
export function agendaSummary(agenda) {
  const official = agenda.sessions.filter((s) => s.id.startsWith("s"));
  const count = (f) => official.filter((s) => s.format === f).length;
  const spans = EVENT_DAYS.map((day) => {
    const list = official.filter((s) => s.date === day);
    if (!list.length) return null;
    const first = list.map((s) => s.start).sort()[0];
    const last = list.map((s) => s.end ?? s.start).sort().at(-1);
    return `${shortDate(day)} ${first}-${last}`;
  }).filter(Boolean);
  return `Official agenda: ${official.length} sessions (${count("talk")} talks on the Fucine and Binario 3 stages, ${count("masterclass")} masterclasses, ${count("live_podcast")} live podcasts, ${count("pitch")} pitch sessions) with ${agenda.speakers.length} speakers. Program hours: ${spans.join(", ")}.`;
}

function renderSection(section, agenda) {
  const items = [...section.items];
  if (section.id === "overview" && agenda) items.splice(2, 0, agendaSummary(agenda));
  return [`## ${section.title}`, bullets(items), formatSources(section.sources)].filter(Boolean).join("\n");
}

function renderLinks() {
  const labels = {
    website: "Official website",
    agenda: "Agenda",
    faqs: "FAQs",
    event_info: "Event info",
    passes: "Passes",
    pass_faq: "Pass FAQ",
    enjoy_turin: "Enjoy Turin",
    side_events: "Side events (Luma)",
    app_ios: "Official app (iOS)",
    app_android: "Official app (Android)",
    live_stream: "Live stream (YouTube)",
    closing_party_tickets: ".WAV closing party (DICE)",
    venue_info: "OGR Torino: info and directions",
  };
  return ["## Official links", bullets(Object.entries(EVENT.links).map(([k, url]) => `${labels[k] ?? k}: ${url}`))].join("\n");
}

/** Practical info. `agenda` adds live numbers to the overview. */
export function formatEventInfo(topic = "overview", agenda = null) {
  const parts =
    topic === "all"
      ? [...EVENT.sections.map((s) => renderSection(s, agenda)), renderLinks()]
      : topic === "links"
        ? [renderLinks()]
        : [renderSection(EVENT.sections.find((s) => s.id === topic), agenda)];
  return `${parts.join("\n\n")}\n\n${footer()}`;
}

function speakerLabel(sp) {
  const details = [sp.role && sp.role !== "Speaker" ? sp.role.toLowerCase() : null, [sp.job_title, sp.company].filter(Boolean).join(", ")].filter(Boolean);
  return details.length ? `${sp.name} (${details.join("; ")})` : sp.name;
}

export function bookingNote(s) {
  if (s.booking) return s.booking;
  if (s.format === "masterclass" || s.format === "live_podcast") return "Included in every pass; book a seat in the official app (limited seats, walk-ins only if there is room).";
  if (s.format === "pitch") return "In the Investor Lounge (Investor and VIP passes).";
  return "Included in every pass.";
}

/** Compact entry used in search results and the skill references. */
export function formatSessionLine(agenda, s, { descriptionChars = 220 } = {}) {
  const people = sessionSpeakers(agenda, s).map(speakerLabel);
  const lines = [`- **${shortDate(s.date)} ${timeRange(s)} | ${s.stage ?? "OGR Torino"} | ${FORMAT_LABELS[s.format] ?? s.format}**: ${s.title} [${s.id}]`];
  if (people.length) lines.push(`  ${people.join("; ")}`);
  if (descriptionChars && s.description) lines.push(`  ${truncate(oneLine(s.description), descriptionChars)}`);
  return lines.join("\n");
}

export function formatSessionDetail(agenda, s) {
  const people = sessionSpeakers(agenda, s);
  const parts = [
    `## ${s.title}`,
    bullets(
      [
        `When: ${formatDate(s.date)}, ${timeRange(s)} (Europe/Rome)`,
        `Where: ${s.stage ?? "OGR Torino"}`,
        `Format: ${FORMAT_LABELS[s.format] ?? s.format}`,
        s.capacity ? `Capacity: ${s.capacity} seats` : null,
        `Access: ${bookingNote(s)}`,
        s.url ? `Link: ${s.url}` : null,
        `Session id: ${s.id}`,
      ].filter(Boolean),
    ),
  ];
  if (s.description) parts.push(`### About\n${s.description}`);
  if (people.length) {
    parts.push(
      `### Speakers\n${people
        .map((sp) => `- **${speakerLabel(sp)}**${sp.bio ? `: ${truncate(oneLine(sp.bio), 600)}` : ""}`)
        .join("\n")}`,
    );
  }
  parts.push(s.sources ? formatSources(s.sources) : `Source: official agenda, ${EVENT.links.agenda}`);
  return parts.join("\n\n");
}

export function formatSpeakerLine(agenda, sp, { bioChars = 0 } = {}) {
  const about = [sp.job_title, sp.company].filter(Boolean).join(", ");
  const sessions = sessionsOfSpeaker(agenda, sp.id).map((s) => {
    const role = s.speakers.find((r) => r.id === sp.id)?.role;
    return `${shortDate(s.date)} ${s.start} ${s.stage}, "${s.title}"${role && role !== "Speaker" ? ` (${role.toLowerCase()})` : ""} [${s.id}]`;
  });
  const bio = bioChars && sp.bio ? ` ${truncate(oneLine(sp.bio), bioChars)}` : "";
  return `- **${sp.name}**${about ? `: ${about}.` : "."}${bio}${sessions.length ? ` Sessions: ${sessions.join("; ")}.` : ""}`;
}

export function formatEventReference(agenda) {
  return `# Wave by Vento 2026: practical information\n\n${formatEventInfo("all", agenda)}`;
}

export function formatProgramReference(agenda, day, snapshotAt) {
  const list = agenda.sessions.filter((s) => s.date === day);
  return [
    `# Wave by Vento 2026: program for ${formatDate(day)}`,
    `Snapshot of the official agenda taken ${snapshotAt}, plus official-adjacent events marked with an x- id. Times and rooms can change: check the live agenda (Wave by Vento connector or ${EVENT.links.agenda}) or the official app before relying on them.`,
    "",
    ...list.map((s) => formatSessionLine(agenda, s, { descriptionChars: 160 })),
    "",
    footer(),
  ].join("\n");
}

export function formatSpeakersReference(agenda, snapshotAt) {
  return [
    "# Wave by Vento 2026: speakers",
    `All ${agenda.speakers.length} speakers in the official agenda snapshot taken ${snapshotAt}, with their sessions (session ids match the program files).`,
    "",
    ...agenda.speakers.map((sp) => formatSpeakerLine(agenda, sp)),
    "",
    footer(),
  ].join("\n");
}
