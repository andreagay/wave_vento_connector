// Markdown renderers shared by the MCP tools and the generated skill references.
import { EVENT, PROGRAM_META, SESSIONS, SPEAKERS, SPEAKERS_META, getSpeaker, sessionsForSpeaker, sourceList } from "./data.js";

export const INFO_TOPICS = [
  "overview",
  "dates_venue",
  "getting_there",
  "passes",
  "access_badge",
  "app",
  "stages_formats",
  "on_site",
  "side_events",
  "closing_party",
  "links",
  "all",
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDate(date) {
  if (!date) return "date TBA";
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatTimeRange(start, end) {
  if (!start) return "time TBA";
  return end ? `${start}-${end}` : `from ${start}`;
}

export function formatSources(ids) {
  const links = sourceList(ids).map((s) => `[${s.title}](${s.url})`);
  return links.length ? `Sources: ${links.join("; ")}` : "";
}

const footer = () =>
  `_Last verified: ${EVENT.last_verified}. ${EVENT.disclaimer} Times are ${EVENT.event.timezone} (${EVENT.event.utc_offset})._`;

const bullets = (items) => items.map((i) => `- ${i}`).join("\n");

const sections = {
  overview() {
    const e = EVENT.event;
    const n = EVENT.numbers;
    return [
      `## ${e.name} (formerly ${e.formerly})`,
      bullets([
        `When: ${formatDate(e.start_date)} to ${formatDate(e.end_date)}, ${e.daily_hours.replace("-", " to ")} each day (${e.timezone}, ${e.utc_offset}).`,
        `Where: ${EVENT.venue.name}, ${EVENT.venue.address}.`,
        `Organiser: ${e.organizer}.`,
        `What: ${e.description}`,
        `In numbers: ${n.talks} talks, ${n.masterclasses} masterclasses, ${n.speakers} speakers, ${n.live_podcasts} live podcasts, ${n.side_events} side events, ${n.investors} investors, ${n.startups} startups, ${n.expected_attendees} expected attendees.`,
        "Headliner: Dario Amodei (Co-founder & CEO, Anthropic) in a fireside chat with John Elkann.",
        `Official website: ${EVENT.links.website} | Agenda: ${EVENT.links.agenda} | Passes: ${EVENT.links.passes}`,
        `Contact: ${e.contact_email}`,
      ]),
      formatSources([...new Set([...e.sources, ...n.sources])]),
    ].join("\n");
  },
  dates_venue() {
    const e = EVENT.event;
    const v = EVENT.venue;
    return [
      "## Dates and venue",
      bullets([
        ...e.days.map((d) => `${formatDate(d.date)}: ${e.daily_hours.replace("-", " to ")}`),
        `Venue: ${v.name}, ${v.address}. ${v.description}`,
        v.event_area,
      ]),
      formatSources([...new Set([...e.sources, ...v.sources])]),
    ].join("\n");
  },
  getting_there() {
    const g = EVENT.getting_there;
    return [
      `## Getting to ${EVENT.venue.name}`,
      `Address: ${EVENT.venue.address}`,
      bullets([`Metro: ${g.metro}`, `Train: ${g.train}`, `Tram/bus: ${g.tram_bus}`, `Parking: ${g.parking.join("; ")}.`, `Luggage: ${EVENT.on_site.luggage}`]),
      formatSources(g.sources),
    ].join("\n");
  },
  passes() {
    const p = EVENT.passes;
    return [
      "## Passes and tickets",
      bullets(p.categories.map((c) => `${c.name} pass: ${c.for}`)),
      `Every pass includes: ${p.included_in_every_pass}`,
      `Free access: ${p.free_access}`,
      "Discounts:",
      bullets(p.discounts),
      `Prices: ${p.pricing_note} ${EVENT.links.passes} (pass FAQ: ${EVENT.links.pass_faq})`,
      formatSources(p.sources),
    ].join("\n");
  },
  access_badge() {
    const a = EVENT.access;
    return ["## Entry and badge", bullets([`Entry: ${a.entry}`, `Badge: ${a.badge}`]), formatSources(a.sources)].join("\n");
  },
  app() {
    const app = EVENT.official_app;
    return [
      "## Official app",
      bullets([`${app.name}: ${app.availability}`, ...app.features, `Android: ${EVENT.links.app_android} (iOS: search "Wave by Vento" on the App Store).`]),
      formatSources(app.sources),
    ].join("\n");
  },
  stages_formats() {
    const st = EVENT.stages;
    return ["## Stages and formats", bullets(st.items.map((s) => `${s.name}: ${s.notes}`)), formatSources(st.sources)].join("\n");
  },
  on_site() {
    const o = EVENT.on_site;
    return [
      "## On-site services",
      bullets([`Accessibility: ${o.accessibility}`, `Food: ${o.food}`, `Cloakroom: ${o.cloakroom}`, `Luggage: ${o.luggage}`]),
      formatSources(o.sources),
    ].join("\n");
  },
  side_events() {
    const s = EVENT.side_events;
    return [
      "## Side events",
      bullets([
        s.summary,
        `Official calendar: ${s.calendar_url}`,
        s.pass_required ? "A Wave pass is required." : "No Wave pass is needed to attend side events.",
        s.registration,
        s.hosting,
      ]),
      formatSources(s.sources),
    ].join("\n");
  },
  closing_party() {
    const c = EVENT.closing_party;
    return [
      `## ${c.name}: closing party`,
      bullets([
        c.summary,
        `When: ${formatDate(c.date)}, ${formatTimeRange(c.start, null)}.`,
        `Where: ${c.location}.`,
        `Line-up: ${c.lineup.join(", ")}.`,
        c.producers,
        `Entry: ${c.entry} ${c.tickets_url}`,
      ]),
      formatSources(c.sources),
    ].join("\n");
  },
  links() {
    const labels = {
      website: "Official website",
      agenda: "Agenda",
      faqs: "FAQs",
      event_info: "Event info",
      passes: "Passes",
      pass_faq: "Pass FAQ",
      enjoy_turin: "Enjoy Turin (tips from the organisers)",
      side_events: "Side events (Luma)",
      app_android: "Official app (Android)",
      closing_party_tickets: ".WAV closing party (DICE)",
      venue_info: "OGR Torino: info and directions",
    };
    return ["## Official links", bullets(Object.entries(EVENT.links).map(([k, url]) => `${labels[k] ?? k}: ${url}`))].join("\n");
  },
};

export function formatEventInfo(topic = "overview") {
  const keys = topic === "all" ? INFO_TOPICS.filter((t) => t !== "all") : [topic];
  const body = keys.map((k) => sections[k]()).join("\n\n");
  return `${body}\n\n${footer()}`;
}

function speakerLabel(sp) {
  const org = sp.organization ? `, ${sp.organization}` : "";
  return `${sp.name} (${sp.role}${org})`;
}

export function formatSession(s) {
  const speakers = s.speakers.map((id) => getSpeaker(id)).filter(Boolean).map(speakerLabel);
  const when = s.date ? `${formatDate(s.date)}, ${formatTimeRange(s.start, s.end)}` : "day and time not yet published in public sources";
  const lines = [
    `### ${s.title}`,
    bullets(
      [
        `Type: ${s.type.replace("_", " ")}`,
        `When: ${when}`,
        `Where: ${s.location}`,
        speakers.length ? `Speakers: ${speakers.join("; ")}` : null,
        s.lineup ? `Line-up: ${s.lineup.join(", ")}` : null,
        s.organizers ? `Organisers: ${s.organizers.join(", ")}` : null,
        `About: ${s.description}`,
        s.booking ? `Booking: ${s.booking}` : null,
        s.url ? `Link: ${s.url}` : null,
        formatSources(s.sources),
      ].filter(Boolean),
    ),
  ];
  return lines.join("\n");
}

export function formatSpeaker(sp) {
  const sessions = sessionsForSpeaker(sp.id).map((s) => `${s.title} (${s.date ? `${formatDate(s.date)}, ${formatTimeRange(s.start, s.end)}` : "date TBA"})`);
  const parts = [`**${sp.name}**: ${sp.role}${sp.organization ? `, ${sp.organization}` : ""}.`];
  if (sp.highlight) parts.push(sp.highlight);
  if (sessions.length) parts.push(`Session: ${sessions.join("; ")}.`);
  return `- ${parts.join(" ")}`;
}

export function programNotice() {
  return `Note: ${PROGRAM_META.note} Full agenda: ${EVENT.links.agenda}`;
}

export function speakersNotice() {
  return `Note: ${SPEAKERS_META.note}`;
}

export function formatProgramReference() {
  return [
    "# Wave by Vento 2026: confirmed sessions (partial)",
    programNotice(),
    "",
    ...SESSIONS.map(formatSession).flatMap((s) => [s, ""]),
    footer(),
  ].join("\n");
}

export function formatSpeakersReference() {
  return ["# Wave by Vento 2026: announced speakers (partial)", speakersNotice(), "", ...SPEAKERS.map(formatSpeaker), "", footer()].join("\n");
}

export function formatEventReference() {
  return `# Wave by Vento 2026: practical information\n\n${formatEventInfo("all")}`;
}
