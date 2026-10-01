// MCP server definition: tools, prompt and instructions for Claude.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOfficialAgenda } from "./agenda.js";
import { EVENT, EVENT_DAYS, FORMATS, SNAPSHOT, findSpeakers, matchScore, prepareAgenda, searchSessions, sessionById, tokenize } from "./data.js";
import { INFO_TOPICS, formatDate, formatEventInfo, formatSessionDetail, formatSessionLine, formatSources, formatSpeakerLine } from "./format.js";
import { OFFICIAL_PAGES, fetchSideEvents, readOfficialPage, romeDate, romeTime } from "./live.js";
import { VERSION } from "./version.js";

export const SERVER_INSTRUCTIONS = `Unofficial guide to Wave by Vento 2026 (formerly Italian Tech Week): 7-9 October 2026 at OGR Torino, Corso Castelfidardo 22, Turin. All times are Europe/Rome (CEST, UTC+2).
Tools:
- search_program, get_session and find_speakers: the official agenda (live, with a saved snapshot as fallback): talks on the Fucine and Binario 3 stages, masterclasses, live podcasts, pitch sessions and their speakers.
- get_event_info: verified practical info (passes and prices, entry and badge, getting there, app, stages, networking, food and services, streaming, side events, the .WAV closing party, Turin tips, contacts).
- get_side_events: live side events from the official Luma calendar.
- read_official_page: current text of official pages (FAQs, event info, passes, Turin tips).
Rules: reply in the user's language. Never invent sessions, times, rooms or speakers: if something is not in a tool result, say so and point to ${EVENT.links.agenda} or the official app. Say whether agenda data is live or from the snapshot. Masterclasses and live podcasts must be booked in the official app; entry needs the pass QR code plus an ID document.`;

const READ_ONLY_WEB = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (value) => ({ content: [{ type: "text", text: value }] });
const errorText = (value) => ({ content: [{ type: "text", text: value }], isError: true });

const prepared = new WeakMap();

/** Live official agenda, or the saved snapshot when Brella is unreachable. */
export async function loadAgenda(fetchImpl) {
  let raw;
  let origin;
  try {
    raw = await fetchOfficialAgenda({ fetchImpl });
    origin = `live official agenda, fetched ${raw.fetched_at}`;
  } catch (err) {
    raw = SNAPSHOT;
    origin = `official agenda snapshot of ${SNAPSHOT.snapshot_at} (live agenda unavailable: ${err.message})`;
  }
  if (!prepared.has(raw)) prepared.set(raw, prepareAgenda(raw));
  return { agenda: prepared.get(raw), origin };
}

function formatSideEvent(e) {
  const when = `${formatDate(romeDate(e.start))}, ${romeTime(e.start)}${e.end ? `-${romeTime(e.end)}` : ""}`;
  const details = [when, e.location, e.hosts?.length ? `hosted by ${e.hosts.join(", ")}` : null, e.requires_approval ? "approval required" : null, e.is_free === true ? "free" : null]
    .filter(Boolean)
    .join(" | ");
  return `- **${e.title}**: ${details}${e.url ? ` | ${e.url}` : ""}`;
}

function announcedNotInAgenda(query) {
  if (!query) return [];
  return EVENT.announced_not_in_agenda.filter((p) => matchScore(p.name, query) > 0);
}

export function createServer({ fetchImpl = globalThis.fetch } = {}) {
  const server = new McpServer(
    {
      name: "wave-by-vento",
      title: "Wave by Vento 2026 (unofficial guide)",
      version: VERSION,
      websiteUrl: "https://github.com/andreagay/wave_vento_connector",
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "search_program",
    {
      title: "Wave by Vento: search the official program",
      description:
        "Searches the official Wave by Vento 2026 agenda (live, falling back to a saved snapshot): talks on the Fucine and Binario 3 stages, masterclasses, live podcasts, pitch sessions, plus the VCunder35 networking event and the .WAV closing party. Filter by keywords, day, format, stage, speaker and start time. Returns session ids for get_session. Keywords in English work best.",
      inputSchema: {
        query: z.string().max(200).optional().describe("Keywords matched against titles, speakers and descriptions, e.g. 'AI', 'fintech', 'DoorDash', 'fundraising'."),
        day: z.enum(EVENT_DAYS).optional().describe("2026-10-07 (Wednesday), 2026-10-08 (Thursday) or 2026-10-09 (Friday)."),
        format: z.enum(FORMATS).optional().describe("talk, masterclass, live_podcast, pitch, networking or party."),
        stage: z.string().max(50).optional().describe("Fucine, Binario 3, Room A, Room B, Room C or Investor Lounge."),
        speaker: z.string().max(100).optional().describe("Speaker name or company."),
        from: z.string().regex(TIME).optional().describe("Only sessions starting at or after this time, HH:MM (Europe/Rome)."),
        to: z.string().regex(TIME).optional().describe("Only sessions starting before this time, HH:MM (Europe/Rome)."),
        limit: z.number().int().min(1).max(100).optional().describe("Maximum number of sessions to return (default 20)."),
      },
      annotations: READ_ONLY_WEB,
    },
    async (args) => {
      const { agenda, origin } = await loadAgenda(fetchImpl);
      const found = searchSessions(agenda, args);
      const max = args.limit ?? 20;
      if (!found.length) {
        const missing = announcedNotInAgenda(args.speaker ?? args.query);
        const note = missing.length ? `\n\n${missing.map((p) => `${p.name}: ${p.note} Not in the official agenda as of ${EVENT.last_verified}.`).join("\n")}` : "";
        return text(`No session matches these filters (source: ${origin}). Try fewer or English keywords, or check the official app.${note}`);
      }
      const more = found.length > max ? `\n\n(${found.length - max} more not shown: narrow the filters or raise 'limit'.)` : "";
      return text(
        `${found.length} session(s) found (source: ${origin}).\n\n${found
          .slice(0, max)
          .map((s) => formatSessionLine(agenda, s))
          .join("\n")}${more}\n\nUse get_session with an id for the full description and speaker bios. Masterclasses and live podcasts must be booked in the official app.`,
      );
    },
  );

  server.registerTool(
    "get_session",
    {
      title: "Wave by Vento: session details",
      description: "Full details of one session from search_program or find_speakers: time, stage, format, capacity, access and booking, description and speaker bios.",
      inputSchema: { id: z.string().max(50).describe("Session id, e.g. 's1021111' or 'x-wav-closing-party'.") },
      annotations: READ_ONLY_WEB,
    },
    async ({ id }) => {
      const { agenda, origin } = await loadAgenda(fetchImpl);
      const session = sessionById(agenda, id.trim());
      if (!session) return errorText(`No session with id "${id}" (source: ${origin}). Find ids with search_program.`);
      return text(`${formatSessionDetail(agenda, session)}\n\n_Source: ${origin}._`);
    },
  );

  server.registerTool(
    "find_speakers",
    {
      title: "Wave by Vento: speakers",
      description:
        "Finds speakers in the official Wave by Vento 2026 agenda by name, company or role, with their sessions (day, time, stage, session id). Short bios are included when few speakers match. Without a query it lists speakers alphabetically.",
      inputSchema: {
        query: z.string().max(100).optional().describe("Name, company or role, e.g. 'Elkann', 'Sequoia', 'CEO'."),
        limit: z.number().int().min(1).max(250).optional().describe("Maximum number of speakers to return (default 25)."),
      },
      annotations: READ_ONLY_WEB,
    },
    async ({ query, limit }) => {
      const { agenda, origin } = await loadAgenda(fetchImpl);
      const found = findSpeakers(agenda, query);
      const missing = announcedNotInAgenda(query);
      const notes = missing.map((p) => `${p.name}: ${p.note} Not in the official agenda or speaker list as of ${EVENT.last_verified}. ${formatSources(p.sources)}`);
      if (!found.length) {
        return text([`No speaker in the official agenda matches "${query}" (source: ${origin}).`, ...notes].join("\n\n"));
      }
      const max = limit ?? 25;
      const bioChars = found.length <= 3 ? 500 : 0;
      const more = found.length > max ? `\n\n(${found.length - max} more not shown: refine the query or raise 'limit'.)` : "";
      return text(
        [`${found.length} speaker(s)${query ? ` matching "${query}"` : ""} out of ${agenda.speakers.length} (source: ${origin}).`, found.slice(0, max).map((sp) => formatSpeakerLine(agenda, sp, { bioChars })).join("\n") + more, ...notes].join("\n\n"),
      );
    },
  );

  server.registerTool(
    "get_event_info",
    {
      title: "Wave by Vento: practical info",
      description:
        "Verified practical information about Wave by Vento 2026 (7-9 October 2026, OGR Torino), checked against the official website: overview, getting there, passes and prices, entry and badge, the official app, stages and formats, masterclass and podcast booking, networking, food and on-site services, live streaming, side events, the .WAV closing party, Turin tips, contacts and official links. Every section cites its sources.",
      inputSchema: {
        topic: z.enum(INFO_TOPICS).optional().describe("Section to return. Defaults to 'overview'; 'all' returns everything."),
      },
      annotations: READ_ONLY_WEB,
    },
    async ({ topic }) => {
      const t = topic ?? "overview";
      const agenda = t === "overview" || t === "all" ? (await loadAgenda(fetchImpl)).agenda : null;
      return text(formatEventInfo(t, agenda));
    },
  );

  server.registerTool(
    "get_side_events",
    {
      title: "Wave by Vento: side events (live)",
      description:
        "Live list of Wave by Vento side events from the official Luma calendar (90+ independent events across Turin). Filter by day and keywords. No Wave pass needed, except for side events held at OGR. Falls back to general info and the calendar link if Luma is unreachable.",
      inputSchema: {
        day: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
          .optional()
          .describe("Local date in Turin, YYYY-MM-DD (side events also run before and after 7-9 October)."),
        query: z.string().max(200).optional().describe("Keywords to match in title, hosts or location, e.g. 'AI', 'investors', 'breakfast'."),
        limit: z.number().int().min(1).max(100).optional().describe("Maximum number of events to return (default 30)."),
      },
      annotations: READ_ONLY_WEB,
    },
    async ({ day, query, limit }) => {
      const info = EVENT.side_events;
      const footer = `${info.pass_rule} ${info.registration} Full calendar: ${info.calendar_url}`;
      try {
        const { events, fetched_at } = await fetchSideEvents({ fetchImpl });
        let list = events;
        if (day) list = list.filter((e) => romeDate(e.start) === day);
        if (query && tokenize(query).length) list = list.filter((e) => matchScore([e.title, e.location, ...(e.hosts ?? [])].join(" "), query) > 0);
        const max = limit ?? 30;
        const header = `${list.length} side event(s)${day ? ` on ${formatDate(day)}` : ""}${query ? ` matching "${query}"` : ""} from the official Luma calendar (fetched ${fetched_at}, times in Europe/Rome).`;
        if (!list.length) return text(`${header}\n\n${footer}`);
        const more = list.length > max ? `\n\n(${list.length - max} more not shown: raise 'limit' or narrow the filters.)` : "";
        return text(`${header}\n\n${list.slice(0, max).map(formatSideEvent).join("\n")}${more}\n\n${footer}`);
      } catch (err) {
        return text(`${err.message}. Browse the official calendar instead: ${info.calendar_url}\n\n${formatEventInfo("side_events")}`);
      }
    },
  );

  server.registerTool(
    "read_official_page",
    {
      title: "Wave by Vento: read official page (live)",
      description:
        "Fetches the current text of an official Wave by Vento page: 'faqs' (everything from access to streaming), 'event_info' (stages, food, venue), 'passes' (current prices and availability), 'pass_faq', 'enjoy_turin' (city guide, hotels, offers) or 'home'. Use 'find' to return only the lines that mention given keywords. For the program use search_program instead.",
      inputSchema: {
        page: z.enum(Object.keys(OFFICIAL_PAGES)).describe("Official page to read."),
        find: z.string().max(200).optional().describe("Optional keywords; only matching lines (with context) are returned."),
        max_chars: z.number().int().min(1000).max(30000).optional().describe("Maximum characters of page text to return (default 12000)."),
      },
      annotations: READ_ONLY_WEB,
    },
    async ({ page, find, max_chars }) => {
      try {
        const r = await readOfficialPage(page, { find, maxChars: max_chars ?? 12000, fetchImpl });
        const parts = [`Source: ${r.url} (fetched ${r.fetched_at})${r.title ? `\nTitle: ${r.title}` : ""}`];
        if (r.matched_lines === 0) parts.push(`No line on this page mentions "${find}". Try other keywords, another page, or the official app.`);
        else parts.push(r.text || "The page returned no readable text. Check it in a browser or in the official app.");
        return text(parts.join("\n\n"));
      } catch (err) {
        return errorText(`Could not read ${OFFICIAL_PAGES[page]}: ${err.message}. Open it directly or use get_event_info.`);
      }
    },
  );

  server.registerPrompt(
    "plan_my_wave",
    {
      title: "Plan my Wave by Vento",
      description: "Builds a personal day-by-day plan for Wave by Vento 2026.",
      argsSchema: {
        profile: z.string().optional().describe("Who you are: founder, investor, student, corporate, press..."),
        interests: z.string().optional().describe("Topics you care about, e.g. AI, fintech, robotics, fundraising."),
        days: z.string().optional().describe("Days you will attend, e.g. 'all', 'Thursday', '8-9 October'."),
      },
    },
    ({ profile, interests, days }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Help me plan my Wave by Vento 2026 (7-9 October, OGR Torino).",
              `Profile: ${profile || "ask me"}. Interests: ${interests || "ask me"}. Days: ${days || "ask me"}.`,
              "Ask me for anything missing first. Then use the Wave by Vento tools (search_program with my interests and days, get_session for details, find_speakers, get_side_events for the evenings, get_event_info for logistics) to build a day-by-day plan with times, stages and session ids.",
              "Only use sessions and times that come from the tools. Leave time to move between stages and for lunch. Remind me to book masterclasses and live podcasts in the official app, to bring the pass QR code and an ID, to print the badge at the kiosks, and about the .WAV closing party on 9 October from 22:00.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
