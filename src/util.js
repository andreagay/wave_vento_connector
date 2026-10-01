// Small shared helpers: polite HTTP fetching, an in-memory cache and
// Europe/Rome date formatting.
export const USER_AGENT = "wave-vento-connector/1.1 (+https://github.com/andreagay/wave_vento_connector)";
export const TIME_ZONE = "Europe/Rome";
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map();

export function clearLiveCache() {
  cache.clear();
}

// Caches successful results only, so a transient failure is retried next call.
export async function cached(key, compute) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await compute();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function fetchOk(fetchImpl, url, accept, timeoutMs = 8000) {
  // WAVE_OFFLINE=1 skips the network: the connector then serves the snapshot.
  if (process.env.WAVE_OFFLINE === "1") throw new Error("offline mode (WAVE_OFFLINE=1)");
  const res = await fetchImpl(url, {
    headers: { "user-agent": USER_AGENT, accept },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res;
}

// Calendar date (YYYY-MM-DD) of an ISO timestamp in Turin.
export function romeDate(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// HH:MM of an ISO timestamp in Turin.
export function romeTime(iso) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
