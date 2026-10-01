// Live data from public official sources: wavebyvento.com pages and the
// official Luma side-events calendar. Everything here is best effort: callers
// must handle errors and fall back to the curated data and links.
import { EVENT, matchScore, normalize, tokenize } from "./data.js";
import { cached, fetchOk } from "./util.js";

export { clearLiveCache, romeDate, romeTime } from "./util.js";

// The agenda page is a JavaScript widget (see agenda.js) and the side events
// have their own tool, so only pages with server-rendered text are listed.
export const OFFICIAL_PAGES = {
  faqs: "https://wavebyvento.com/faqs",
  event_info: "https://wavebyvento.com/event-info",
  passes: "https://wavebyvento.com/getyourpass",
  pass_faq: "https://wavebyvento.com/faq-pass",
  enjoy_turin: "https://wavebyvento.com/enjoy-turin",
  home: "https://wavebyvento.com/",
};

const LUMA_API_HOSTS = ["https://api.lu.ma", "https://api2.luma.com"];

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', laquo: '"', raquo: '"', middot: "-", bull: "-",
  euro: "EUR", copy: "(c)", reg: "(R)", trade: "(TM)", agrave: "à", egrave: "è", eacute: "é",
  igrave: "ì", ograve: "ò", ugrave: "ù", Agrave: "À", Egrave: "È", Eacute: "É",
};

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

export function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : null;
}

export function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(head|title|script|style|noscript|svg|template|iframe|nav)\b[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<h([1-6])\b[^>]*>/gi, (_, level) => `\n${"#".repeat(Number(level))} `);
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/(p|div|section|article|header|footer|li|ul|ol|h[1-6]|tr|table|main|nav|aside|figure|figcaption|blockquote|dd|dt|summary|details)\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  const lines = s
    .split("\n")
    .map((l) => l.replace(/[\u200b-\u200d\ufeff]/g, "").replace(/[ \t\f\v\u00a0]+/g, " ").trim())
    .filter((l) => l && l !== "-" && !/^#+$/.test(l));
  // Drop consecutive duplicates (menus and carousels repeat a lot).
  return lines.filter((l, i) => l !== lines[i - 1]).join("\n");
}

function parseJsonScripts(html, pattern) {
  const out = [];
  for (const m of html.matchAll(pattern)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // Ignore malformed blocks.
    }
  }
  return out;
}

export function extractJsonLd(html) {
  return parseJsonScripts(html, /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
}

export function extractNextData(html) {
  return parseJsonScripts(html, /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)[0] ?? null;
}

function walk(node, visit, depth = 0) {
  if (depth > 40 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, depth + 1);
    return;
  }
  visit(node);
  for (const value of Object.values(node)) walk(value, visit, depth + 1);
}

// schema.org Event objects found in JSON-LD blocks.
export function eventsFromJsonLd(blocks) {
  const events = [];
  walk(blocks, (o) => {
    const type = [].concat(o["@type"] ?? []);
    if (!type.some((t) => /Event$/.test(String(t))) || typeof o.name !== "string") return;
    const location = typeof o.location === "string" ? o.location : (o.location?.name ?? o.location?.address?.streetAddress ?? null);
    const performers = [].concat(o.performer ?? []).map((p) => (typeof p === "string" ? p : p?.name)).filter(Boolean);
    events.push({ title: o.name, start: o.startDate ?? null, end: o.endDate ?? null, location, url: o.url ?? null, performers });
  });
  return events;
}

function lumaUrl(slug) {
  if (!slug) return null;
  return /^https?:\/\//.test(slug) ? slug : `https://luma.com/${slug}`;
}

// Luma payloads nest event objects in different wrappers depending on the
// endpoint; anything with a name and an ISO start_at is treated as an event.
export function collectLumaEvents(payload) {
  const byKey = new Map();
  walk(payload, (o) => {
    const ev = o.event && typeof o.event === "object" ? o.event : o;
    if (typeof ev.name !== "string" || typeof ev.start_at !== "string" || Number.isNaN(Date.parse(ev.start_at))) return;
    const geo = ev.geo_address_info ?? {};
    const hosts = [].concat(o.hosts ?? ev.hosts ?? []).map((h) => h?.name).filter(Boolean);
    const ticket = o.ticket_info ?? ev.ticket_info ?? {};
    const item = {
      title: ev.name.replace(/\s+/g, " ").trim(),
      start: ev.start_at,
      end: typeof ev.end_at === "string" ? ev.end_at : null,
      location: geo.full_address ?? geo.address ?? geo.city_state ?? geo.city ?? (ev.location_type === "online" ? "Online" : null),
      url: lumaUrl(ev.url),
      hosts,
      requires_approval: typeof ticket.require_approval === "boolean" ? ticket.require_approval : null,
      is_free: typeof ticket.is_free === "boolean" ? ticket.is_free : null,
    };
    const key = ev.api_id ?? `${item.title}|${item.start}`;
    const prev = byKey.get(key);
    // Prefer the richest copy of the same event.
    if (!prev || (item.hosts.length && !prev.hosts.length) || (item.location && !prev.location)) byKey.set(key, item);
  });
  return [...byKey.values()].sort((a, b) => a.start.localeCompare(b.start));
}

async function sideEventsFromLumaApi(fetchImpl) {
  const slug = EVENT.side_events.luma_slug;
  let lastError;
  for (const host of LUMA_API_HOSTS) {
    try {
      const resolved = await (await fetchOk(fetchImpl, `${host}/url?url=${encodeURIComponent(slug)}`, "application/json")).json();
      const calendarId = resolved?.data?.calendar?.api_id;
      if (typeof calendarId !== "string") throw new Error(`Luma calendar "${slug}" not found`);
      const events = [];
      let cursor = null;
      for (let page = 0; page < 5; page++) {
        const params = new URLSearchParams({ calendar_api_id: calendarId, pagination_limit: "50", period: "future" });
        if (cursor) params.set("pagination_cursor", cursor);
        const data = await (await fetchOk(fetchImpl, `${host}/calendar/get-items?${params}`, "application/json")).json();
        events.push(...collectLumaEvents(data.entries ?? data));
        if (!data.has_more || !data.next_cursor) break;
        cursor = data.next_cursor;
      }
      return events;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function sideEventsFromLumaPage(fetchImpl) {
  const html = await (await fetchOk(fetchImpl, EVENT.side_events.calendar_url, "text/html")).text();
  const nextData = extractNextData(html);
  const events = nextData ? collectLumaEvents(nextData) : [];
  if (events.length) return events;
  const fromLd = eventsFromJsonLd(extractJsonLd(html)).filter((e) => typeof e.start === "string" && !Number.isNaN(Date.parse(e.start)));
  return fromLd.map((e) => ({ title: e.title, start: e.start, end: e.end, location: e.location, url: e.url, hosts: e.performers, requires_approval: null, is_free: null }));
}

/**
 * Side events from the official Luma calendar. Tries Luma's public web API
 * first (complete, paginated), then the server-rendered calendar page.
 */
export async function fetchSideEvents({ fetchImpl = globalThis.fetch } = {}) {
  return cached("side-events", async () => {
    const errors = [];
    for (const [source, strategy] of [
      ["luma-api", sideEventsFromLumaApi],
      ["luma-page", sideEventsFromLumaPage],
    ]) {
      try {
        const events = await strategy(fetchImpl);
        if (events.length) {
          // Merge duplicates coming from the same event listed twice.
          const seen = new Set();
          const unique = events
            .filter((e) => {
              const key = `${normalize(e.title)}|${e.start}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
          return { source, fetched_at: new Date().toISOString(), events: unique };
        }
        errors.push(`${source}: no events found`);
      } catch (err) {
        errors.push(`${source}: ${err.message}`);
      }
    }
    throw new Error(`Live side events unavailable (${errors.join("; ")})`);
  });
}

// Webflow pages repeat a marquee and end with footer and newsletter blocks:
// keep the first copy of lines repeated 3+ times and cut the site footer.
export function stripBoilerplate(text) {
  let lines = text.split("\n");
  const footer = lines.findIndex((l, i) => i > 0 && l === "ORGANIZED BY");
  if (footer > 0) lines = lines.slice(0, footer);
  const counts = new Map();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  const seen = new Set();
  return lines
    .filter((l) => {
      if (counts.get(l) < 3) return true;
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    })
    .join("\n");
}

/**
 * Reads an official page and returns its visible text. With `find`, only the
 * lines matching the keywords (plus some context) are returned.
 */
export async function readOfficialPage(page, { find, maxChars = 12000, fetchImpl = globalThis.fetch } = {}) {
  const url = OFFICIAL_PAGES[page];
  if (!url) throw new Error(`Unknown page "${page}"`);
  const parsed = await cached(`page:${page}`, async () => {
    const html = await (await fetchOk(fetchImpl, url, "text/html")).text();
    return { title: extractTitle(html), text: stripBoilerplate(htmlToText(html)), events: eventsFromJsonLd(extractJsonLd(html)) };
  });

  let text = parsed.text;
  let matches = null;
  if (find && tokenize(find).length) {
    const lines = text.split("\n");
    const keep = new Set();
    matches = 0;
    lines.forEach((line, i) => {
      if (matchScore(line, find) === 0) return;
      matches++;
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) keep.add(j);
    });
    const picked = [...keep].sort((a, b) => a - b);
    text = picked.map((i, k) => (k > 0 && i !== picked[k - 1] + 1 ? `...\n${lines[i]}` : lines[i])).join("\n");
  }

  const truncated = text.length > maxChars;
  if (truncated) text = `${text.slice(0, text.lastIndexOf("\n", maxChars) > 0 ? text.lastIndexOf("\n", maxChars) : maxChars)}\n[...truncated]`;
  return { page, url, title: parsed.title, fetched_at: new Date().toISOString(), text, truncated, matched_lines: matches, events: parsed.events };
}
