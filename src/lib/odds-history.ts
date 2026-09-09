import { ODDS_LEAGUES, type OddsEvent, type OddsSignal, type OddsSnapshot } from "./odds";

export type HistoryEvent = Pick<OddsEvent, "sport" | "league" | "provider" | "provider_event_id" | "espn_event_id">;
export interface HistorySnapshot extends OddsSnapshot {
  signals?: OddsSignal[];
  signal_count?: number;
  snapshot_id: number;
  captured_at: string;
  provider_id: string;
  provider_name: string;
}
export interface HistoryData { history: HistorySnapshot[] }
export interface HistoryState { data?: HistoryData; loading: boolean; error?: string; updatedAt?: number }
const EMPTY: HistoryState = { loading: false };
export const HISTORY_MAX_AGE = 5 * 60_000;

export function historyUrl(event: HistoryEvent) {
  const league = ODDS_LEAGUES.find(item => item.sport === event.sport && item.league === event.league);
  const provider = event.provider ?? (event.espn_event_id ? "espn" : undefined);
  const id = event.provider_event_id ?? (provider === "espn" ? event.espn_event_id : undefined);
  if (!league || !provider || !id) return null;
  return `/api/odds/history/${encodeURIComponent(provider)}/${encodeURIComponent(id)}/?${new URLSearchParams({ sport: league.sport, league: league.league })}`;
}

const numericFields = ["home_ml", "draw_ml", "away_ml", "open_home_ml", "open_draw_ml", "open_away_ml", "total_line", "over_ml", "under_ml", "home_spread", "home_spread_ml", "away_spread", "away_spread_ml"] as const;
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
const invalid = () => new Error("The odds service returned malformed history. Please retry.");

export function parseHistory(payload: unknown, url: string): HistoryData {
  if (!record(payload) || !Array.isArray(payload.history)) throw invalid();
  const requested = new URL(url, "http://localhost");
  const path = requested.pathname.split("/").filter(Boolean);
  for (const [field, expected] of [["sport", requested.searchParams.get("sport")], ["league", requested.searchParams.get("league")], ["provider", decodeURIComponent(path[3])], ["provider_event_id", decodeURIComponent(path[4])]]) {
    if (payload[field!] != null && payload[field!] !== expected) throw invalid();
  }
  const byId = new Map<string, string>();
  const unique = new Map<string, HistorySnapshot>();
  for (const raw of payload.history) {
    if (!record(raw) || !Number.isSafeInteger(raw.snapshot_id) || typeof raw.captured_at !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw.captured_at) || !Number.isFinite(Date.parse(raw.captured_at))) throw invalid();
    // The generic backend route filters to DraftKings (provider_id 100).
    // Explicit sportsbook identifiers remain separate if the contract expands.
    if (raw.provider_id != null && typeof raw.provider_id !== "string" && typeof raw.provider_id !== "number") throw invalid();
    if (raw.provider_name != null && typeof raw.provider_name !== "string") throw invalid();
    const providerId = String(raw.provider_id ?? (raw.provider_name ? `name:${raw.provider_name}` : "100"));
    const row: HistorySnapshot = { snapshot_id: raw.snapshot_id as number, captured_at: raw.captured_at, provider_id: providerId, provider_name: typeof raw.provider_name === "string" ? raw.provider_name : providerId === "100" ? "DraftKings" : `Sportsbook ${providerId}` };
    for (const field of numericFields) {
      const value = raw[field];
      if (value != null && (typeof value !== "number" || !Number.isFinite(value))) throw invalid();
      row[field] = value == null ? null : value as number;
    }
    if (raw.line_phase != null) {
      if (!["opening", "current", "archived"].includes(String(raw.line_phase))) throw invalid();
      row.line_phase = raw.line_phase as HistorySnapshot["line_phase"];
    }
    if (raw.source != null) {
      if (raw.source !== "scoreboard" && raw.source !== "summary_pickcenter") throw invalid();
      row.source = raw.source;
    }
    if (raw.source_event_state != null) {
      if (!["pre", "in", "post"].includes(String(raw.source_event_state))) throw invalid();
      row.source_event_state = raw.source_event_state as HistorySnapshot["source_event_state"];
    }
    if (raw.is_backfill != null) {
      if (typeof raw.is_backfill !== "boolean") throw invalid();
      row.is_backfill = raw.is_backfill;
    }
    if (raw.signals != null) {
      if (!Array.isArray(raw.signals) || !raw.signals.every(signal => record(signal)
        && ["rule", "type", "market", "prediction"].every(key => typeof signal[key] === "string")
        && (signal.predicted_side === null || typeof signal.predicted_side === "string")
        && typeof signal.matched === "boolean")) throw invalid();
      row.signals = raw.signals as OddsSignal[];
    }
    if (raw.signal_count != null) {
      if (!Number.isSafeInteger(raw.signal_count) || Number(raw.signal_count) < 0) throw invalid();
      row.signal_count = Number(raw.signal_count);
    }
    const content = JSON.stringify({ ...row, snapshot_id: undefined });
    const identity = `${providerId}:${row.snapshot_id}`;
    if (byId.has(identity) && byId.get(identity) !== content) throw invalid();
    byId.set(identity, content);
    const prior = unique.get(content);
    if (!prior || row.snapshot_id < prior.snapshot_id) unique.set(content, row);
  }
  return { history: [...unique.values()].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at) || a.provider_id.localeCompare(b.provider_id, "en") || a.snapshot_id - b.snapshot_id) };
}

export function formatMovement(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return "—";
  // American odds jump at even money; zero/sub-100 prices have no standard payout interpretation.
  if (Math.abs(current) < 100 || Math.abs(previous) < 100) return "—";
  if (current === previous) return "0 · No change";
  const decimal = (value: number) => value > 0 ? 1 + value / 100 : 1 + 100 / -value;
  const direction = decimal(current) - decimal(previous);
  const delta = current - previous;
  if (!Number.isFinite(delta)) return "—";
  return `${delta > 0 ? "+" : ""}${delta} ML pts · ${direction === 0 ? "Same payout" : direction > 0 ? "Longer odds" : "Shorter odds"}${Math.sign(current) !== Math.sign(previous) ? " (crosses even money)" : ""}`;
}

export function precedingSnapshot(rows: HistorySnapshot[], index: number) {
  const row = rows[index];
  const sameBook = rows.filter(item => item.provider_id === row.provider_id);
  const time = Date.parse(row.captured_at);
  // IDs make display order deterministic, but do not establish order for simultaneous captures.
  if (sameBook.filter(item => Date.parse(item.captured_at) === time).length !== 1) return undefined;
  const previous = sameBook.filter(item => Date.parse(item.captured_at) < time).at(-1);
  if (!previous || sameBook.filter(item => Date.parse(item.captured_at) === Date.parse(previous.captured_at)).length !== 1) return undefined;
  if (previous.source_event_state !== row.source_event_state || previous.is_backfill !== row.is_backfill || previous.line_phase !== row.line_phase) return undefined;
  return previous;
}

// Like the feed cache, this is in-memory and uses fetch + AbortController, with no new dependency.
export function createHistoryStore(fetcher: typeof fetch = fetch, now = Date.now) {
  type Entry = { state: HistoryState; listeners: Set<() => void>; controller?: AbortController; pending?: Promise<void> };
  const entries = new Map<string, Entry>();
  const entry = (url: string) => {
    let value = entries.get(url);
    if (!value) {
      if (entries.size >= 100) {
        const disposable = [...entries].find(([, item]) => !item.listeners.size && !item.controller);
        if (disposable) entries.delete(disposable[0]);
      }
      value = { state: EMPTY, listeners: new Set() }; entries.set(url, value);
    }
    return value;
  };
  const publish = (item: Entry, state: HistoryState) => { item.state = state; item.listeners.forEach(listener => listener()); };
  return {
    getSnapshot(url: string | null) { return url ? entries.get(url)?.state ?? EMPTY : EMPTY; },
    subscribe(url: string, listener: () => void) {
      const item = entry(url); item.listeners.add(listener);
      return () => {
        item.listeners.delete(listener);
        if (!item.listeners.size && item.controller) {
          item.controller.abort(); item.controller = undefined; item.pending = undefined;
          item.state = { ...item.state, loading: false };
        }
      };
    },
    load(url: string, force = false): Promise<void> {
      const item = entry(url);
      if (item.pending) return item.pending;
      if (!force && item.state.updatedAt != null && now() - item.state.updatedAt < HISTORY_MAX_AGE) return Promise.resolve();
      const controller = new AbortController(); item.controller = controller;
      publish(item, { ...item.state, loading: true });
      const active = () => item.controller === controller && !controller.signal.aborted;
      item.pending = (async () => {
        try {
          const response = await fetcher(url, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(response.status === 404 || response.status === 204 ? "Odds history is unavailable for this event." : `Unable to load odds history (${response.status}).`);
          if (response.status === 204) throw new Error("Odds history is unavailable for this event.");
          const data = parseHistory(await response.json(), url);
          if (active()) publish(item, { data, loading: false, updatedAt: now() });
        } catch (error) {
          if (active()) publish(item, { ...item.state, loading: false, error: error instanceof Error ? error.message : "Unable to load odds history." });
        } finally {
          // Even a synchronously throwing transport must release the assigned promise.
          await Promise.resolve();
          if (active()) { item.controller = undefined; item.pending = undefined; }
        }
      })();
      return item.pending;
    },
  };
}
export const historyStore = createHistoryStore();
