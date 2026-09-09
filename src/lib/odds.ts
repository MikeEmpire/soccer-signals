export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const ODDS_LEAGUES = [
  { key: "champions-league", label: "Champions League", sport: "soccer", league: "uefa.champions", mark: "UCL" },
  { key: "premier-league", label: "Premier League", sport: "soccer", league: "eng.1", mark: "PL" },
  { key: "la-liga", label: "La Liga", sport: "soccer", league: "esp.1", mark: "LL" },
  { key: "nfl", label: "NFL", sport: "football", league: "nfl", mark: "NFL" },
  { key: "mlb", label: "MLB", sport: "baseball", league: "mlb", mark: "MLB" },
] as const;
export type OddsLeague = typeof ODDS_LEAGUES[number];

export interface OddsSnapshot {
  open_home_ml?: number | null; open_draw_ml?: number | null; open_away_ml?: number | null;
  home_ml?: number | null; draw_ml?: number | null; away_ml?: number | null;
  total_line?: number | null; over_ml?: number | null; under_ml?: number | null;
  home_spread?: number | null; home_spread_ml?: number | null;
  away_spread?: number | null; away_spread_ml?: number | null;
  source?: "scoreboard" | "summary_pickcenter" | null;
  source_event_state?: "pre" | "in" | "post" | null;
  is_backfill?: boolean | null; line_phase?: "opening" | "current" | "archived" | null;
  captured_at?: string | null;
}
export interface OddsSignal {
  rule: string; type: string; matched: boolean; market: string; prediction: string;
  predicted_side: string | null; confidence?: string | null;
  tier?: "primary" | "alternate" | "secondary" | null;
  label?: string | null;
  strength?: "standard" | "weak" | null;
  reason?: string | null; description?: string | null;
  threshold?: JsonValue; observed_value?: JsonValue; context?: { [key: string]: JsonValue } | null;
}
export interface SignalExclusion { rule: string; description: string }
export interface MarketOutlook {
  home_implied_probability?: number | null;
  away_implied_probability?: number | null;
  favored_side?: "home" | "away" | null;
  captured_at?: string | null;
}
export interface BettingSplitSide {
  odds?: number | null; bet_pct?: number | null; handle_pct?: number | null;
  valid?: boolean | null; money_differential?: number | null;
  bet_pct_change?: number | null; handle_pct_change?: number | null;
}
export interface BettingSplits {
  status?: "fresh" | "unavailable" | "stale" | "invalid_moneyline" | "disabled" | string | null;
  signal_eligible?: boolean | null;
  moneyline?: Sides<BettingSplitSide> | null;
  last_checked_at?: string | null; captured_at?: string | null;
  max_age_seconds?: number | null; age_seconds?: number | null;
}
export interface StartingPitcher {
  player_id?: number | null; espn_player_id?: number | string | null;
  name?: string | null; headshot_url?: string | null; record?: string | null;
  wins?: number | null; losses?: number | null; era?: number | null; whip?: number | null;
  throws?: string | null; updated_at?: string | null;
}
export interface InjuryReport {
  player_id?: number | null; espn_player_id?: string | number | null;
  player_name: string; position?: string | null; status?: string | null;
  injury?: string | null; expected_return?: string | null; as_of?: string | null;
  source_game_id?: string | null; freshness?: string | null;
}
type Sides<T> = { home?: T | null; away?: T | null };
export interface MLBMatchupContext {
  game_pk?: number | null;
  teams?: Sides<{ team_id?: number; name?: string; record?: string | null }> | null;
  starting_pitchers?: Sides<StartingPitcher> | null;
  injuries?: Sides<InjuryReport[]> | null;
  series?: { game_number?: number | null; is_postseason?: boolean; home_series_record?: string | null; away_series_record?: string | null } | null;
  previous_game?: { home_loss_margin?: number | null; away_loss_margin?: number | null } | null;
}
export interface OddsEvent {
  id: number; provider?: string; provider_event_id?: string; espn_event_id?: string;
  sport: string; league: string; start_time: string; kickoff?: string;
  status_state?: string; status_name?: string;
  odds_status?: "unknown" | "available" | "unavailable" | "error";
  odds_status_reason?: string | null; odds_checked_at?: string | null;
  home_participant?: string; away_participant?: string; home_team: string; away_team: string;
  odds?: OddsSnapshot | null; signal_count: number; signals: OddsSignal[];
  signal?: OddsSignal | null; signal_exclusions?: SignalExclusion[] | null;
  matchup_context?: MLBMatchupContext | null;
  market_outlook?: MarketOutlook | null;
  betting_splits?: BettingSplits | null;
}
export interface OddsFeedResponse {
  count: number; signal_count: number; upcoming_days: number;
  window_start_date: string; window_end_date: string;
  events: OddsEvent[]; matches?: OddsEvent[];
}

export function feedUrl(league: OddsLeague) {
  return `/api/odds/pregame/?${new URLSearchParams({ sport: league.sport, league: league.league })}`;
}
export function readable(value: string) {
  return value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}
export function formatValue(value: JsonValue | undefined): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.map(formatValue).join(", ") || "—";
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${readable(key)}: ${formatValue(item)}`).join(" · ") || "—";
  return String(value);
}
export function predictedTeam(event: Pick<OddsEvent, "home_team" | "away_team">, side: string | null) {
  return side === "home" ? event.home_team : side === "away" ? event.away_team : side ? readable(side) : "—";
}
export const SIGNAL_RULE_LABELS: Record<string, string> = {
  mlb_market_implied_win_probability: "Market-implied probability ≥60%",
  both_moneylines_unchanged_favorite: "Unchanged opening moneylines",
  opening_to_current_movement_weak_favorite: "Small line movement — weak favorite support",
  mlb_betting_money_support: "Money supports this team",
  mlb_public_bets_underdog_moneyline_move: "Public bets / opposing line movement",
  mlb_losing_record_favorable_runline: "Below .500 — +1.5 run-line support",
};
export function signalRuleLabel(signal: OddsSignal) {
  return signal.label?.trim() || SIGNAL_RULE_LABELS[signal.rule] || readable(signal.rule || signal.description || signal.reason || "signal");
}
export function percentage(value: number | null | undefined, digits = 0) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
}
export function probabilityPercentage(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}
export function percentagePoints(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value} pp`;
}
export function moneyline(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value > 0 ? `+${value}` : String(value);
}
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function groupEvents(events: OddsEvent[], now = new Date()) {
  const labels = new Map<string, string>();
  ["Today", "Tomorrow", "Day after tomorrow"].forEach((label, offset) => {
    const date = new Date(now); date.setDate(date.getDate() + offset);
    labels.set(localDateKey(date), label);
  });
  const groups = new Map<string, OddsEvent[]>();
  // The response is the complete window; do not synthesize dates or fetch extra events.
  for (const event of [...events].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))) {
    const date = new Date(event.start_time);
    const key = Number.isNaN(date.getTime()) ? "unknown" : localDateKey(date);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups].map(([key, items]) => ({ key, label: labels.get(key) ?? (key === "unknown" ? "Start time TBD" : new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })), events: items }));
}

// Abort plus an identity guard also protects against transports that finish after cancellation.
export function createFeedLoader(fetcher: typeof fetch = fetch) {
  let controller: AbortController | undefined;
  return {
    cancel() { controller?.abort(); controller = undefined; },
    async load(league: OddsLeague, onData: (data: OddsFeedResponse) => void, onError: (message: string) => void, onDone: () => void) {
      controller?.abort();
      const current = new AbortController(); controller = current;
      try {
        const response = await fetcher(feedUrl(league), { cache: "no-store", signal: current.signal });
        if (!response.ok) throw new Error(`Unable to load odds (${response.status}).`);
        const data: OddsFeedResponse = await response.json();
        if (!Array.isArray(data.events)) throw new Error("The odds service returned an invalid feed.");
        if (controller === current && !current.signal.aborted) onData(data);
      } catch (error) {
        if (controller === current && !current.signal.aborted) onError(error instanceof Error ? error.message : "Unable to load odds.");
      } finally {
        if (controller === current && !current.signal.aborted) onDone();
      }
    },
  };
}
