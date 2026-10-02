export type Numeric = number | string | null;
export type Prop = "receiving_yards" | "receptions";
export const NFL_BOOKS = ["draftkings", "fanduel", "bovada"] as const;
export const PROP_LABELS = { receiving_yards: "Receiving yards", receptions: "Receptions" };
export interface Stats {
  available?: boolean; games_available?: number; games_observed?: number;
  mean?: Numeric; median?: Numeric; stddev?: Numeric; cv?: Numeric; iqr?: Numeric;
}
export interface ReceivingCard {
  id: string; game_id: string; player: { id: string; name: string }; prop: Prop;
  available: boolean; reason: string | null; input_observed_at: string | null;
  projection: { baseline?: Numeric; opportunity_adjustment?: Numeric; opponent_adjustment?: Numeric;
    final?: Numeric; components?: Record<string, { value: Numeric; games: number; effective_weight: Numeric; used: boolean }> };
  market: { books_expected: number; books_available: number; median_line: Numeric; line_range: Numeric;
    expires_at?: string | null;
    books: { id: string; name: string; line: Numeric; over_odds: Numeric; under_odds: Numeric; last_seen_at: string | null; edge: Numeric }[] };
  edge_vs_median: Numeric; history: Record<string, Record<string, Stats>>;
  opportunity: { trend?: Record<string, Numeric> }; volatility: Stats;
  hit_rates: Record<string, Record<string, { over: number; under: number; push: number; sample_size: number; over_rate_excluding_pushes: Numeric }>>;
  data_gaps: string[];
}
export interface ReceivingFeed {
  generated_at: string; window_start: string; window_end: string; window_hours: number;
  game_count: number; count: number; projection_count: number; truncated: boolean;
  games: { id: string; name: string; kickoff: string }[]; signals: ReceivingCard[];
}
export function numberLabel(value: Numeric | undefined, signed = false) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${signed && n > 0 ? "+" : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
export function marketIsCurrent(card: ReceivingCard, now: number) {
  return Boolean(card.market.expires_at && Date.parse(card.market.expires_at) > now);
}
export function parseReceivingFeed(value: unknown): ReceivingFeed {
  if (!value || typeof value !== "object") throw new Error("The NFL service returned an unexpected response.");
  const data = value as Partial<ReceivingFeed>;
  if (![48, 72].includes(data.window_hours ?? 0) || !Array.isArray(data.games) || !Array.isArray(data.signals)
      || !data.generated_at || !Number.isFinite(Date.parse(data.generated_at))
      || data.signals.some(card => !card || !(card.prop in PROP_LABELS) || !card.player
        || !card.projection || !card.market || !Array.isArray(card.market.books)
        || !card.history || !card.opportunity || !card.volatility)
      || data.games.some(game => !game || !game.id || !Number.isFinite(Date.parse(game.kickoff)))) {
    throw new Error("The NFL service returned an unexpected response.");
  }
  return data as ReceivingFeed;
}
export async function loadReceivingFeed(signal?: AbortSignal): Promise<ReceivingFeed> {
  const response = await fetch("/api/odds/nfl/receiving/", { cache: "no-store", signal });
  if (!response.ok) throw new Error("NFL research is unavailable. Try refreshing shortly.");
  return parseReceivingFeed(await response.json());
}
