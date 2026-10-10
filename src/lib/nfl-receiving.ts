export type Numeric = number | string | null;
export type Prop = "receiving_yards" | "receptions" | "rushing_yards" | "rushing_attempts" | "anytime_td";
export type NFLFamily = "receiving" | "rushing" | "anytime-td";
export const NFL_BOOKS = ["draftkings", "fanduel", "bovada"] as const;
export const PROP_LABELS = { receiving_yards: "Receiving yards", receptions: "Receptions", rushing_yards: "Rushing yards", rushing_attempts: "Rushing attempts", anytime_td: "Anytime TD" };
export interface ReceivingSignal {
  version?: string; direction: "OVER" | "UNDER" | "YES" | "NO" | "PASS"; status: "eligible" | "unavailable";
  comparison_side?: "yes" | "no"; implied_probability?: Numeric; book_probabilities?: Record<string, Numeric>;
  projection?: Numeric; threshold?: Numeric; edge?: Numeric; edge_pct?: Numeric;
  confidence: Numeric; confidence_components?: Record<string, Numeric>;
  confidence_interpretation?: string; threshold_is_offered?: boolean; threshold_interpretation?: string;
  reasons: { code: string; text: string }[];
  data_quality?: { gaps: string[]; sample_size: number; books_available: number; verified_mapping: boolean; missing_volume: boolean };
}
export interface Stats {
  available?: boolean; games_available?: number; games_observed?: number;
  sample_size?: number; min?: Numeric; max?: Numeric; range?: Numeric; mean?: Numeric; median?: Numeric; stddev?: Numeric; cv?: Numeric; iqr?: Numeric;
}
export interface PastProp {
  bookmaker: string; bookmaker_name: string; line: Numeric;
  observed_at?: string | null; source?: string; result: "OVER" | "UNDER" | "PUSH" | "YES" | "NO" | null;
}
export interface RecentGame {
  game_id: string | null; kickoff: string; season?: number | null; season_type?: number | null;
  opponent_id?: string | null; opponent: string | null; home_away?: string | null;
  scored?: Numeric; touchdowns?: Numeric; recorded_touchdowns?: Numeric;
  rushing_yards?: Numeric; carries?: Numeric; receiving_yards?: Numeric; receptions?: Numeric; targets?: Numeric; value: Numeric; props: PastProp[];
}
export function selectPastProp(props: PastProp[], preferredBook?: string) {
  const order = preferredBook ? [preferredBook, ...NFL_BOOKS] : NFL_BOOKS;
  return order.map(book => props.find(prop => prop.bookmaker === book && prop.line != null)).find(Boolean);
}
export interface SavedQuote {
  status: "fresh" | "stale" | "withdrawn" | "invalid_timestamp";
  line: Numeric; american_odds: Numeric; last_seen_at: string | null;
  provider_updated_at?: string | null; expires_at: string | null;
  snapshot_id?: number | string; stale_reasons?: string[];
}
export interface ReceivingBook {
  id: string; name: string; line: Numeric; over_odds?: Numeric; under_odds?: Numeric;
  last_seen_at: string | null; edge: Numeric; saved_edge?: Numeric; expires_at?: string | null;
  yes_odds?: Numeric; no_odds?: Numeric; yes_expires_at?: string | null; no_expires_at?: string | null;
  over_expires_at?: string | null; under_expires_at?: string | null;
  latest_saved?: { over?: SavedQuote | null; under?: SavedQuote | null; yes?: SavedQuote | null; no?: SavedQuote | null } | null;
}
export interface DisplayQuote {
  status: "fresh" | "stale" | "withdrawn" | "invalid_timestamp" | "missing";
  line: Numeric; odds: Numeric; observedAt: string | null; providerUpdatedAt?: string | null;
  staleReasons: string[];
}
// Presentation only: saved sides never contribute to the live consensus or signal.
export function displayBookSide(book: ReceivingBook | undefined, side: "over" | "under", now: number, outdated = false, sample = false): DisplayQuote {
  const missing: DisplayQuote = { status: "missing", line: null, odds: null, observedAt: null, staleReasons: [] };
  if (!book) return missing;
  const saved = book.latest_saved?.[side];
  // A withdrawal or invalid observation supersedes any older browser-held value.
  if (saved?.status === "withdrawn" || saved?.status === "invalid_timestamp") return { ...missing, status: saved.status };
  const odds = book[`${side}_odds`];
  const expires = book[`${side}_expires_at`];
  const direct = book.line != null && odds != null;
  if (direct && !outdated && (sample || deadlineIsCurrent(expires, now))) {
    return { status: "fresh", line: book.line, odds: odds!, observedAt: side === "over" ? book.last_seen_at : saved?.line === book.line ? saved.last_seen_at : null, staleReasons: [] };
  }
  if (saved && saved.line != null && saved.american_odds != null) {
    return { status: !outdated && saved.status === "fresh" && deadlineIsCurrent(saved.expires_at, now) ? "fresh" : "stale",
      line: saved.line, odds: saved.american_odds, observedAt: saved.last_seen_at,
      providerUpdatedAt: saved.provider_updated_at, staleReasons: saved.stale_reasons ?? [] };
  }
  // Older responses have no saved-side DTO. Retain their known paired quote on
  // local expiry/error, but never resurrect it when a newer response clears it.
  if (direct && book.latest_saved === undefined) return { status: "stale", line: book.line, odds: odds!,
    observedAt: side === "over" ? book.last_seen_at : null, staleReasons: [] };
  return missing;
}
export function quoteAge(timestamp: string | null | undefined, now: number) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > now) return "Age unavailable";
  const minutes = Math.floor((now - Date.parse(timestamp)) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export interface SavedProbabilitySide {
  implied_probability: Numeric; projection: Numeric; edge: Numeric;
  books_available: number; books: (SavedQuote & { bookmaker: string })[];
  status: "fresh" | "stale"; oldest_observed_at: string | null; newest_observed_at: string | null; expires_at: string | null;
}
export interface SavedLineComparison {
  source: "latest_saved_main_lines"; status: "fresh" | "stale";
  median_line: Numeric; projection: Numeric; edge_vs_median: Numeric;
  books_available: number; books: (SavedQuote & { bookmaker: string })[];
  oldest_observed_at: string | null; newest_observed_at: string | null;
  expires_at: string | null; projection_observed_at: string | null;
}
export interface SavedTDComparison {
  source: "latest_saved_main_prices";
  sides: Partial<Record<"yes" | "no", SavedProbabilitySide>>;
  projection_observed_at: string | null;
}
export type SavedComparison = SavedLineComparison | SavedTDComparison;
export interface RecordedSignal {
  prediction_id: number | string; version: string; recorded_at: string;
  status: "historical"; is_current: false; signal: ReceivingSignal;
  main_lines: Record<string, Numeric>; market_expires_at: string | null; market_is_stale: boolean;
}
export interface Availability {
  status: string; freshness?: string; blocking_reason?: string | null;
  observed_at?: string | null; source?: string | null;
  players?: { player_id: string; name?: string | null; relationship: string; status: string; injury?: string | null; reported_at?: string | null }[];
}
export interface InjuryOpportunity {
  observed_at?: string | null;
  contributors?: {
    code: string; related_player_id: string; affected_player_id: string; market: Prop;
    status: string; role: string; role_source: string; explanation: string;
    freshness: string; injury_observed_at?: string | null; reported_at?: string | null;
    sample: { leader_usage: Numeric; leader_share: Numeric; beneficiary_usage: Numeric; beneficiary_share: Numeric;
      beneficiary_games: number; game_ids: (string | number)[]; games_without_recorded_leader_usage: (string | number)[];
      records: { player_id: string; name: string; game_id: string | number; kickoff: string; finalized_at: string; metric: string; value: Numeric }[] };
  }[];
}
export function availabilityHeld(availability: Availability | null | undefined) {
  return Boolean(availability && (availability.blocking_reason || availability.freshness !== "fresh"
    || ["unknown", "out", "inactive", "doubtful"].includes(availability.status)));
}
export interface ReceivingCard {
  id: string; game_id: string; player: { id: string; name: string }; prop: Prop;
  availability?: Availability | null; late_availability_notice?: Availability | null; injury_opportunity?: InjuryOpportunity;
  opponent_context?: { metric?: string; opponent?: Stats; league?: Stats; used_in_projection?: boolean; interpretation?: string };
  available: boolean; reason: string | null; input_observed_at: string | null;
  recent_games?: { label: string; scope: string; observed_at: string | null; total_available: number; games: RecentGame[] } | null;
  display?: { state: string; label: string; description?: string; show_confidence?: boolean; show_market_table?: boolean } | null;
  last_recorded_signal?: RecordedSignal | null;
  signal?: ReceivingSignal; live_signal?: ReceivingSignal | null; lock_at?: string;
  official_prediction?: { id: number; prediction_id: number; lock_at: string; recorded_at: string; signal: ReceivingSignal } | null;
  projection: { unit?: string; sample_size?: number; scoring_games?: Numeric; method?: string; baseline?: Numeric; opportunity_adjustment?: Numeric; opponent_adjustment?: Numeric; floor_adjustment?: Numeric;
    final?: Numeric; conditional_on_playing?: Numeric; components?: Record<string, { value: Numeric; games: number; effective_weight: Numeric; used: boolean }> };
  market: { books_expected: number; books_available: number; books_with_saved_prices?: number; median_line: Numeric; line_range: Numeric;
    expires_at?: string | null; consensus_expires_at?: string | null;
    saved_comparison?: SavedComparison | null;
    books: ReceivingBook[] };
  edge_vs_median: Numeric; history: Record<string, Record<string, Stats>>;
  opportunity: { yards_per_carry?: { available?: boolean; value?: Numeric; games?: number }; trend?: Record<string, Numeric>; windows?: Record<string, Record<string, Stats & { value?: Numeric; games?: number }>> }; volatility: Stats;
  hit_rates: Record<string, Record<string, { over: number; under: number; push: number; sample_size: number; over_rate_excluding_pushes: Numeric }>>;
  data_gaps: string[];
}
export interface ReceivingFeed {
  api_version?: string; total_count?: number; next_cursor?: string | null;
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
export function deadlineIsCurrent(deadline: string | null | undefined, now: number) {
  return Boolean(deadline && Date.parse(deadline) > now);
}
export function consensusIsCurrent(card: ReceivingCard, now: number) {
  return card.market.books_available >= 2 && deadlineIsCurrent(card.market.consensus_expires_at, now);
}
// Normalize decimal fields without touching IDs, timestamps, or canonical threshold keys.
const numericKeys = new Set(["yes_odds", "no_odds", "implied_probability", "scored", "touchdowns", "recorded_touchdowns", "scoring_games", "conditional_on_playing", "rushing_yards", "carries", "leader_usage", "leader_share", "beneficiary_usage", "beneficiary_share", "baseline", "opportunity_adjustment", "opponent_adjustment", "final", "value", "effective_weight", "configured_weight", "median_line", "line_range", "line", "over_odds", "under_odds", "edge", "edge_vs_median", "saved_edge", "projection", "threshold", "edge_pct", "confidence", "mean", "median", "stddev", "cv", "iqr", "min", "max", "range", "over_rate_excluding_pushes", "closing_line", "clv", "actual", "american_odds", "receiving_yards", "receptions", "targets"]);
export function normalizeNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") throw new Error("The NFL service returned an unexpected response.");
  const number = Number(value);
  if (!Number.isFinite(number) || (typeof value === "string" && !value.trim())) throw new Error("The NFL service returned an unexpected response.");
  return number;
}
function normalize(value: unknown, key = "", parent = ""): unknown {
  if (Array.isArray(value)) return value.map(item => normalize(item, key));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, k, key)]));
  return numericKeys.has(key) || parent === "book_probabilities" || parent === "main_lines" || parent === "trend" || parent === "confidence_components" ? normalizeNumeric(value) : value;
}
function validSavedQuotes(book: ReceivingBook) {
  if (!book || typeof book.id !== "string") return false;
  if (book.latest_saved == null) return true;
  return (["over", "under", "yes", "no"] as const).every(side => {
    const quote = book.latest_saved?.[side];
    return quote == null || (["fresh", "stale", "withdrawn", "invalid_timestamp"].includes(quote.status)
      && (quote.stale_reasons == null || (Array.isArray(quote.stale_reasons) && quote.stale_reasons.every(reason => typeof reason === "string"))));
  });
}
function validRecentGames(recent: ReceivingCard["recent_games"], binary = false) {
  return recent == null || (Array.isArray(recent.games) && recent.games.every(game => game
    && typeof game.kickoff === "string" && Number.isFinite(Date.parse(game.kickoff))
    && (game.opponent == null || typeof game.opponent === "string")
    && Array.isArray(game.props) && game.props.every(prop => prop && typeof prop.bookmaker === "string"
      && typeof prop.bookmaker_name === "string" && (prop.result == null || (binary ? ["YES", "NO"] : ["OVER", "UNDER", "PUSH"]).includes(prop.result)))));
}
function validSignal(signal: ReceivingSignal | null | undefined, binary = false) {
  return !signal || ((binary ? ["YES", "NO", "PASS"] : ["OVER", "UNDER", "PASS"]).includes(signal.direction) && ["eligible", "unavailable"].includes(signal.status)
    && Array.isArray(signal.reasons) && signal.reasons.every(reason => typeof reason.code === "string" && typeof reason.text === "string"));
}
function validSavedContext(card: ReceivingCard, binary = false) {
  const comparison = card.market.saved_comparison;
  const record = card.last_recorded_signal;
  return (comparison == null || (binary ? validTDComparison(comparison) : (comparison.source === "latest_saved_main_lines"
    && ["fresh", "stale"].includes(comparison.status) && comparison.books_available >= 2
    && Array.isArray(comparison.books) && comparison.books.every(book => book && typeof book.bookmaker === "string"))))
    && (record == null || (record.status === "historical" && record.is_current === false
      && typeof record.version === "string" && Number.isFinite(Date.parse(record.recorded_at))
      && Boolean(record.signal) && validSignal(record.signal, binary) && record.signal.status === "eligible"
      && record.main_lines != null && typeof record.main_lines === "object" && !Array.isArray(record.main_lines)));
}
function validAvailability(value: Availability | null | undefined) {
  return value == null || (typeof value.status === "string"
    && (value.freshness == null || typeof value.freshness === "string")
    && (value.players == null || (Array.isArray(value.players) && value.players.every(player => player
      && typeof player.relationship === "string" && typeof player.status === "string"
      && (player.injury == null || typeof player.injury === "string")))));
}
function validInjuryOpportunity(value: InjuryOpportunity | null | undefined) {
  return value == null || value.contributors == null || (Array.isArray(value.contributors) && value.contributors.every(item => item
    && [item.code, item.status, item.role, item.role_source, item.explanation, item.freshness].every(field => typeof field === "string")
    && item.sample && Array.isArray(item.sample.game_ids) && Array.isArray(item.sample.games_without_recorded_leader_usage)
    && Array.isArray(item.sample.records) && item.sample.records.every(row => row && typeof row.name === "string"
      && typeof row.metric === "string" && typeof row.kickoff === "string")));
}
function probability(value: Numeric | undefined) {
  return value == null || (typeof value === "number" && value >= 0 && value <= 1);
}
function validTDComparison(value: SavedComparison) {
  return value.source === "latest_saved_main_prices" && value.sides != null
    && Object.entries(value.sides).every(([side, item]) => ["yes", "no"].includes(side) && item
      && probability(item.implied_probability) && probability(item.projection)
      && ["fresh", "stale"].includes(item.status) && item.books_available >= 2
      && Array.isArray(item.books) && item.books.every(book => book && NFL_BOOKS.includes(book.bookmaker as typeof NFL_BOOKS[number]) && book.line === null));
}
function validTDCard(card: ReceivingCard) {
  const signals = [card.signal, card.live_signal, card.official_prediction?.signal, card.last_recorded_signal?.signal];
  const noProjection = !card.available && card.projection.final == null && card.projection.conditional_on_playing == null;
  return (card.projection.unit === "probability" || (card.projection.unit == null && noProjection))
    && probability(card.projection.final) && probability(card.projection.conditional_on_playing)
    && card.market.median_line === null && card.market.line_range === null
    && card.market.books.every(book => book.line === null && [book.latest_saved?.yes, book.latest_saved?.no].every(q => !q || q.line === null))
    && signals.every(signal => !signal || ((signal.threshold === null || (signal.threshold === undefined && signal.direction === "PASS" && signal.status === "unavailable")) && probability(signal.projection) && probability(signal.implied_probability)
      && (signal.comparison_side == null || ["yes", "no"].includes(signal.comparison_side))
      && (signal.book_probabilities == null || (typeof signal.book_probabilities === "object" && !Array.isArray(signal.book_probabilities) && Object.values(signal.book_probabilities).every(probability)))))
    && (card.recent_games?.games.every(game => [null, 0, 1].includes(game.value as number | null)
      && (game.recorded_touchdowns == null || (Number.isInteger(game.recorded_touchdowns) && Number(game.recorded_touchdowns) >= 0))
      && (game.scored == null || [0, 1].includes(Number(game.scored))) && game.props.every(prop => prop.line === null)) ?? true);
}
export function parseReceivingFeed(value: unknown, family: NFLFamily = "receiving"): ReceivingFeed {
  const data = normalize(value) as ReceivingFeed;
  const binary = family === "anytime-td";
  if (!data || ![48, 72].includes(data.window_hours) || !Array.isArray(data.games) || !Array.isArray(data.signals)
      || !data.generated_at || !Number.isFinite(Date.parse(data.generated_at))
      || (data.next_cursor != null && typeof data.next_cursor !== "string")
      || data.signals.some(card => !card || !card.id || !card.game_id || !(binary ? ["anytime_td"] : family === "rushing" ? ["rushing_yards", "rushing_attempts"] : ["receiving_yards", "receptions"]).includes(card.prop) || !card.player
        || !card.projection || !card.market || !Array.isArray(card.market.books) || !card.market.books.every(validSavedQuotes)
        || !card.history || !card.opportunity || !card.volatility || !validSignal(card.signal, binary)
        || !validAvailability(card.availability) || !validAvailability(card.late_availability_notice) || !validInjuryOpportunity(card.injury_opportunity)
        || !validSavedContext(card, binary) || !validRecentGames(card.recent_games, binary) || (binary && !validTDCard(card))
        || (card.display != null && (typeof card.display.state !== "string" || typeof card.display.label !== "string"))
        || !validSignal(card.live_signal, binary) || !validSignal(card.official_prediction?.signal, binary))
      || data.games.some(game => !game || !game.id || !Number.isFinite(Date.parse(game.kickoff)))) {
    throw new Error("The NFL service returned an unexpected response.");
  }
  return data;
}
export class NFLPageExpiredError extends Error {
  constructor() { super("This page has expired. Refreshing the latest props."); }
}

export async function loadReceivingFeed(
  signal?: AbortSignal,
  family: NFLFamily = "receiving",
  options: { prop?: Prop; cursor?: string | null } = {},
): Promise<ReceivingFeed> {
  signal?.throwIfAborted();
  const params = new URLSearchParams({ limit: "20" });
  if (options.prop) params.set("prop", options.prop);
  if (options.cursor) params.set("cursor", options.cursor);
  const response = await fetch(`/api/odds/nfl/${family}/?${params}`, { cache: "no-store", signal });
  if (response.status === 400 && options.cursor) throw new NFLPageExpiredError();
  if (!response.ok) throw new Error("NFL research is unavailable. Try refreshing shortly.");
  const page = parseReceivingFeed(await response.json(), family);
  signal?.throwIfAborted();
  if (page.next_cursor && page.next_cursor === options.cursor) throw new Error("The NFL service returned a repeated cursor.");
  if (page.truncated && !page.next_cursor) throw new Error("The NFL service returned an incomplete slate. Try refreshing shortly.");
  return { ...page, projection_count: page.signals.filter(card => card.available || card.projection.conditional_on_playing != null).length };
}

export function mergeReceivingPage(previous: ReceivingFeed, page: ReceivingFeed): ReceivingFeed {
  const games = new Map(previous.games.map(game => [game.id, game]));
  page.games.forEach(game => games.set(game.id, game));
  const cards = new Map(previous.signals.map(card => [card.id, card]));
  page.signals.forEach(card => cards.set(card.id, card));
  const signals = [...cards.values()];
  return { ...page, games: [...games.values()], game_count: games.size, signals,
    count: signals.length, projection_count: signals.filter(card => card.available || card.projection.conditional_on_playing != null).length };
}
