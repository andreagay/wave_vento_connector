// MCP server definition: tools, prompt and instructions for Claude.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EVENT, EVENT_DAYS, SESSIONS, SESSION_TYPES, findSpeakers, matchScore, searchProgram, tokenize } from "./data.js";
import { INFO_TOPICS, formatDate, formatEventInfo, formatSession, formatSpeaker, programNotice, speakersNotice } from "./format.js";
import { OFFICIAL_PAGES, fetchSideEvents, readOfficialPage, romeDate, romeTime } from "./live.js";
import { VERSION } from "./version.js";

export const SERVER_INSTRUCTIONS = `Unofficial guide to Wave by Vento 2026 (formerly Italian Tech Week): 7-9 October 2026, OGR Torino, Corso Castelfidardo 22, Turin, 09:00-18:00. All times are Europe/Rome (CEST, UTC+2).
Tools:
- get_event_info: verified practical info (venue and transport, passes, entry and badge, official app, stages, food/cloakroom/luggage/accessibility, side events, .WAV closing party, official links).
- search_program and find_speakers: curated but PARTIAL list of confirmed sessions and announced speakers.
- read_official_page: live text of the official website; use page="agenda" (optionally with find="...") for the full, current program.
- get_side_events: live list of side events from the official Luma calendar.
Rules: reply in the user's language. Never invent sessions, dates, times, rooms or speakers: if something is not in a tool result, say so and point to ${EVENT.links.agenda} or the official app. Include the relevant official link. Remind people that masterclass seats must be booked in the official app and that entry requires the pass QR code plus an ID document.`;

const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const READ_ONLY_WEB = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const text = (value) => ({ content: [{ type: "text", text: value }] });
const errorText = (value) => ({ content: [{ type: "text", text: value }], isError: true });

function formatSideEvent(e) {
  const when = `${formatDate(romeDate(e.start))}, ${romeTime(e.start)}${e.end ? `-${romeTime(e.end)}` : ""}`;
  const details = [when, e.location, e.hosts?.length ? `hosted by ${e.hosts.join(", ")}` : null, e.requires_approval ? "approval required" : null, e.is_free === true ? "free" : null]
    .filter(Boolean)
    .join(" | ");
  return `- **${e.title}**: ${details}${e.url ? ` | ${e.url}` : ""}`;
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
    "get_event_info",
    {
      title: "Wave by Vento: practical info",
      description:
        "Verified practical information about Wave by Vento 2026 (formerly Italian Tech Week), 7-9 October 2026 at OGR Torino, Turin: dates and hours, venue and how to get there, passes and discounts, entry and badge printing, the official app, stages and formats, on-site services (food, cloakroom, luggage, accessibility), side events, the .WAV closing party and official links. Every answer includes its sources.",
      inputSchema: {
        topic: z
          .enum(INFO_TOPICS)
          .optional()
          .describe("Which section to return. Defaults to 'overview'. Use 'all' for everything."),
      },
      annotations: READ_ONLY_LOCAL,
    },
    async ({ topic }) => text(formatEventInfo(topic ?? "overview")),
  );

  server.registerTool(
    "search_program",
    {
      title: "Wave by Vento: search confirmed sessions",
      description:
        "Searches the curated list of Wave by Vento 2026 sessions confirmed by public sources (fireside chats, masterclasses, networking, the closing party). The list is PARTIAL: when a session is not found, call read_official_page with page='agenda'. Keywords in English work best.",
      inputSchema: {
        query: z.string().max(200).optional().describe("Keywords, e.g. 'AI', 'Amodei', 'masterclass SMEs'."),
        day: z.enum(EVENT_DAYS).optional().describe("Event day: 2026-10-07 (Wed), 2026-10-08 (Thu) or 2026-10-09 (Fri)."),
        type: z.enum(SESSION_TYPES).optional().describe("Session format."),
        speaker: z.string().max(100).optional().describe("Speaker name or company."),
      },
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => {
      const { sessions, undated } = searchProgram(args);
      const parts = [];
      if (sessions.length) {
        parts.push(`Found ${sessions.length} confirmed session(s) (out of ${SESSIONS.length} currently in the curated list).`, ...sessions.map(formatSession));
      } else {
        parts.push("No confirmed session matches these filters in the curated list.");
      }
      if (undated.length) {
        parts.push(`Matching sessions whose day is not public yet (they may or may not be on ${formatDate(args.day)}):`, ...undated.map(formatSession));
      }
      parts.push(programNotice(), "For the complete, up-to-date program call read_official_page with page='agenda' (optionally with find=<keywords>), or check the official app.");
      return text(parts.join("\n\n"));
    },
  );

  server.registerTool(
    "find_speakers",
    {
      title: "Wave by Vento: announced speakers",
      description:
        "Lists or searches the speakers publicly announced for Wave by Vento 2026 (name, role, company, and their session when known). The list is PARTIAL (200+ speakers in total): for others call read_official_page with page='agenda' and find=<name>.",
      inputSchema: {
        query: z.string().max(100).optional().describe("Name, company or role, e.g. 'Amodei', 'Sequoia', 'CEO'. Omit to list everyone announced."),
      },
      annotations: READ_ONLY_LOCAL,
    },
    async ({ query }) => {
      const found = findSpeakers(query);
      if (!found.length) {
        return text(`No announced speaker matches "${query}" in the curated list. ${speakersNotice()} Try read_official_page with page='agenda' and find='${query}'.`);
      }
      return text([`${found.length} announced speaker(s):`, found.map(formatSpeaker).join("\n"), speakersNotice()].join("\n\n"));
    },
  );

  server.registerTool(
    "get_side_events",
    {
      title: "Wave by Vento: side events (live)",
      description:
        "Live list of Wave by Vento side events from the official Luma calendar (90+ independent events across Turin; no Wave pass needed). Filter by day and keywords. Falls back to general info and the calendar link if Luma is unreachable.",
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
      try {
        const { events, fetched_at } = await fetchSideEvents({ fetchImpl });
        let list = events;
        if (day) list = list.filter((e) => romeDate(e.start) === day);
        if (query && tokenize(query).length) list = list.filter((e) => matchScore([e.title, e.location, ...(e.hosts ?? [])].join(" "), query) > 0);
        const max = limit ?? 30;
        const header = `${list.length} side event(s)${day ? ` on ${formatDate(day)}` : ""}${query ? ` matching "${query}"` : ""} from the official Luma calendar (fetched ${fetched_at}, times in Europe/Rome).`;
        const footer = `No Wave pass needed. ${info.registration} Full calendar: ${info.calendar_url}`;
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
        "Fetches the current text of an official Wave by Vento page. Use page='agenda' for the full program, 'faqs' or 'event_info' for logistics, 'passes'/'pass_faq' for tickets, 'enjoy_turin' for city tips, 'side_events_calendar' for the Luma page. Use 'find' to return only the lines that mention given keywords (e.g. a speaker or topic).",
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
        if (r.matched_lines === 0) parts.push(`No line on this page mentions "${find}". The content may be loaded dynamically: check ${r.url} or the official app.`);
        else parts.push(r.text || "The page returned no readable text (it may be rendered dynamically). Check it in a browser or in the official app.");
        if (r.events.length) parts.push(`Structured events found on the page:\n${r.events.map((e) => `- ${e.title}${e.start ? ` | ${e.start}` : ""}${e.location ? ` | ${e.location}` : ""}`).join("\n")}`);
        return text(parts.join("\n\n"));
      } catch (err) {
        return errorText(`Could not read ${OFFICIAL_PAGES[page]}: ${err.message}. Open it directly or use the official app.`);
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
              "Ask me for anything missing first. Then use the Wave by Vento tools (get_event_info, search_program, find_speakers, read_official_page with page='agenda', get_side_events) to build a day-by-day plan with times, stages and links.",
              "Only use sessions and times that come from the tools; flag anything not yet confirmed. Include: entry (pass QR + ID), badge kiosks, masterclasses to book in the official app, lunch options, side events in the evening, and the .WAV closing party on 9 October from 22:00.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
