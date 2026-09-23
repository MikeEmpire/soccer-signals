import type { OddsSnapshot } from "./odds";

export type SignalOutcome = "win" | "loss" | "push" | "pending" | "ungradable" | string;

export const OUTCOME_LABELS: Record<string, string> = {
  win: "Hit",
  loss: "Miss",
  push: "Push",
  pending: "Awaiting result",
  ungradable: "Unable to grade",
};

export interface ReviewSignal {
  rule: string;
  label?: string | null;
  description?: string | null;
  reason?: string | null;
  market: string;
  selected_team?: { name?: string | null } | null;
  predicted_side?: string | null;
  selection_line?: number | null;
  outcome: SignalOutcome;
  outcome_reason?: string | null;
}

export interface ReviewObservation {
  id: number;
  version: string;
  evaluated_at: string;
  period_scope?: string | null;
  decision_policy?: string | null;
  favorite?: {
    side?: string | null;
    won?: boolean | null;
    basis?: string | null;
  } | null;
  signals: ReviewSignal[];
  signal_count: number;
  in_performance_cohort?: boolean | null;
}

export interface GameResult {
  status: string;
  home_score?: number | null;
  away_score?: number | null;
  reason?: string | null;
}

export interface GameTeam {
  name?: string | null;
}

export interface GameFavorite {
  side?: string | null;
  won?: boolean | null;
  basis?: string | null;
}

export interface RetrospectiveSignal {
  rule: string;
  label?: string | null;
  description?: string | null;
  reason?: string | null;
  market?: string | null;
  selected_team?: { name?: string | null } | null;
  predicted_side?: string | null;
  outcome?: string | null;
  outcome_reason?: string | null;
}

export interface RetrospectiveAnalysis {
  signals?: RetrospectiveSignal[] | null;
  limitations?: string[] | null;
  market_provenance?: string | null;
}

export interface GameReview {
  id: number;
  event_id?: number | null;
  game_id?: number | null;
  home: GameTeam;
  away: GameTeam;
  kickoff_at: string;
  result?: GameResult | null;
  favorite?: GameFavorite | null;
  odds?: OddsSnapshot | null;
  observations?: ReviewObservation[] | null;
  excluded_observations?: number | null;
  retrospective_analysis?: RetrospectiveAnalysis | null;
  // Performance cohort fields — do not use as aggregate badges for all observations.
  summary?: unknown;
  signal_outcomes?: unknown;
  any_signal_hit?: boolean | null;
}

export interface CalendarDate {
  date: string;
  game_count: number;
  games_with_recorded_signals: number;
  games_with_results: number;
  has_recorded_signals: boolean;
  has_results: boolean;
}

export interface CalendarMonth {
  league: string;
  sport: string;
  month: string;
  timezone: "UTC";
  date_basis: "UTC kickoff date";
  coverage: string;
  previous_month: string | null;
  next_month: string | null;
  generated_at: string;
  expires_at: string;
  cache_ttl_seconds: number;
  game_count: number;
  dates: CalendarDate[];
}

export interface DailyReview {
  count: number;
  next: string | null;
  previous: string | null;
  league: string;
  since: string;
  until: string;
  timezone: "UTC";
  date_basis: "UTC kickoff date";
  results: GameReview[];
}

export function utcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateKey(d);
}

export function formatUTCDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return (
      d.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) +
      " UTC"
    );
  } catch {
    return isoString;
  }
}

export function formatUTCTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) + " UTC";
  } catch {
    return isoString;
  }
}

export function signalDisplayLabel(signal: Pick<ReviewSignal | RetrospectiveSignal, "label" | "rule">): string {
  return signal.label?.trim() || String(signal.rule || "Signal").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function gameReviewKey(league: string, game: GameReview): string {
  if (game.event_id != null) return `${league}:odds:${game.event_id}`;
  if (game.game_id != null) return `${league}:game:${game.game_id}`;
  return `${league}:id:${game.id}`;
}

// Fetches all pages for a given league+date, calling onData incrementally.
export function createReviewLoader(fetcher: typeof fetch = fetch) {
  let controller: AbortController | undefined;
  return {
    cancel() {
      controller?.abort();
      controller = undefined;
    },
    async load(
      league: string,
      date: string,
      onData: (results: GameReview[]) => void,
      onError: (message: string) => void,
      onDone: () => void,
    ) {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const accumulated: GameReview[] = [];
      let nextUrl: string | null = `/api/odds/results/?${new URLSearchParams({ league, date, include_observations: "true", page_size: "50" })}`;
      try {
        while (nextUrl) {
          const response = await fetcher(nextUrl, { cache: "no-store", signal: current.signal });
          if (!response.ok) throw new Error(`Unable to load review (${response.status}).`);
          const data: DailyReview = await response.json();
          if (!Array.isArray(data.results)) throw new Error("The review service returned an invalid response.");
          accumulated.push(...data.results);
          if (controller === current && !current.signal.aborted) onData([...accumulated]);
          if (data.next) {
            // Rewrite the backend next URL through our proxy by preserving its query string.
            try {
              const parsed = new URL(data.next, "http://placeholder");
              nextUrl = `/api/odds/results/?${parsed.searchParams}`;
            } catch {
              nextUrl = null;
            }
          } else {
            nextUrl = null;
          }
        }
      } catch (error) {
        if (controller === current && !current.signal.aborted) {
          onError(error instanceof Error ? error.message : "Unable to load review.");
        }
      } finally {
        if (controller === current && !current.signal.aborted) onDone();
      }
    },
  };
}
