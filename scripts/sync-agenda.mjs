#!/usr/bin/env node
// Saves a snapshot of the official agenda to data/agenda.json. The connector
// serves live data and falls back to this snapshot; the plugin's skill
// references are generated from it. Run it, then `npm run build:plugin`.
// Behind an HTTP proxy, run with NODE_USE_ENV_PROXY=1 (Node 22.21+).
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BRELLA_TIMESLOTS_URL, fetchOfficialAgenda } from "../src/agenda.js";

const OUT = fileURLToPath(new URL("../data/agenda.json", import.meta.url));

const agenda = await fetchOfficialAgenda();
const snapshot = {
  snapshot_at: agenda.fetched_at,
  source: {
    title: "Official agenda (Brella widget on wavebyvento.com/agenda)",
    page: "https://wavebyvento.com/agenda",
    api: BRELLA_TIMESLOTS_URL,
  },
  sessions: agenda.sessions,
  speakers: agenda.speakers,
};
await writeFile(OUT, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Saved ${agenda.sessions.length} sessions and ${agenda.speakers.length} speakers to data/agenda.json (${agenda.fetched_at}).`);
