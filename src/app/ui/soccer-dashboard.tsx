"use client";

import { Activity, AlertCircle, ArrowUpRight, CalendarDays, Check, ChevronDown, Clock3, RefreshCw, Shield, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type League = "all" | "eng.1" | "esp.1" | "uefa.champions";
type SignalType = "draw" | "home_win" | "away_win" | "none";
type Odds = { home_ml: number; draw_ml: number; away_ml: number; open_home_ml: number | null; open_draw_ml: number | null; open_away_ml: number | null; captured_at: string };
type Signal = { type: SignalType; matched: boolean; draw_gap: number; higher_ml_side: "home" | "away"; higher_team_ml: number; other_team_ml: number; predicted_side: "home" | "away" | "draw" | null };
type Match = { id: number; espn_event_id: string; league: Exclude<League, "all">; kickoff: string; home_team: string; away_team: string; odds: Odds | null; signal: Signal | null };
type ApiResponse = { count: number; upcoming_days: number; matches: Match[] };
type HistorySnapshot = { snapshot_id: number; captured_at: string; home_ml: number; draw_ml: number; away_ml: number; delta_home_ml: number | null; delta_draw_ml: number | null; delta_away_ml: number | null; signal: Signal };
type OddsHistoryResponse = { espn_event_id: string; snapshot_count: number; history: HistorySnapshot[] };

const REFRESH_INTERVAL = 60_000;
const leagueMeta = {
  "eng.1": { name: "Premier League", mark: "PL", className: "epl" },
  "esp.1": { name: "La Liga", mark: "LL", className: "laliga" },
  "uefa.champions": { name: "Champions League", mark: "UCL", className: "ucl" },
} as const;

function formatMoneyline(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function formatKickoff(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date),
    time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date),
  };
}

function relativeTime(value: string, now: number) {
  const minutes = Math.floor(Math.max(0, now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatSnapshotTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompactDuration(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatCountdown(kickoff: string, now: number) {
  const remainingSeconds = Math.max(0, Math.floor((new Date(kickoff).getTime() - now) / 1000));
  return remainingSeconds <= 0 ? "Started" : formatCompactDuration(remainingSeconds);
}

function formatOddsAge(capturedAt: string, now: number) {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(capturedAt).getTime()) / 1000));
  return `${formatCompactDuration(elapsedSeconds)} ago`;
}

function formatDelta(value: number | null) {
  if (value === null) return "Opening";
  if (value === 0) return "No change";
  return value > 0 ? `+${value}` : String(value);
}

function signalLabel(signal: Signal) {
  if (signal.type === "draw") return "Draw signal";
  if (signal.type === "away_win") return "Away win";
  if (signal.type === "home_win") return "Home win";
  return "No signal";
}

function SignalBadge({ signal }: { signal: Signal | null }) {
  if (!signal) return <span className="status-badge status-unavailable">Odds unavailable</span>;
  if (!signal.matched) return <span className="status-badge status-quiet"><span className="status-dot" /> No signal</span>;
  return <span className="status-badge status-active"><Activity size={13} strokeWidth={2.5} /> {signalLabel(signal)}</span>;
}

function LeagueMark({ league }: { league: Match["league"] }) {
  const meta = leagueMeta[league];
  return <span className={`league-mark league-${meta.className}`}>{meta.mark}</span>;
}

function OddsRow({ odds, homeTeam, awayTeam, highlighted }: { odds: Odds | null; homeTeam: string; awayTeam: string; highlighted?: Signal["predicted_side"] }) {
  const columns = [
    { key: "home", label: homeTeam, current: odds?.home_ml, opening: odds?.open_home_ml },
    { key: "draw", label: "Draw", current: odds?.draw_ml, opening: odds?.open_draw_ml },
    { key: "away", label: awayTeam, current: odds?.away_ml, opening: odds?.open_away_ml },
  ] as const;
  return <div className="odds-row">{columns.map((column) => (
    <div className={`odds-cell ${highlighted === column.key ? "odds-highlighted" : ""}`} key={column.key}>
      <div className="odds-label">{column.label}{highlighted === column.key && <Check size={11} strokeWidth={3} />}</div>
      <div className="odds-value">{formatMoneyline(column.current)}</div>
      <div className="odds-opening">{column.opening == null ? "Opening —" : `Open ${formatMoneyline(column.opening)}`}</div>
    </div>
  ))}</div>;
}

function SignalExplanation({ signal, homeTeam, awayTeam }: { signal: Signal; homeTeam: string; awayTeam: string }) {
  const higherSide = signal.higher_ml_side === "home" ? homeTeam : awayTeam;
  const oppositeSide = signal.higher_ml_side === "home" ? awayTeam : homeTeam;
  return <p className="signal-explanation">Draw is <strong>{signal.draw_gap} points</strong> from {higherSide} <strong>{formatMoneyline(signal.higher_team_ml)}</strong>. Opposite side is {oppositeSide} <strong>{formatMoneyline(signal.other_team_ml)}</strong>.</p>;
}

function MatchCountdown({ kickoff, now }: { kickoff: string; now: number }) {
  const countdown = formatCountdown(kickoff, now);
  return <span className={`match-countdown ${countdown === "Started" ? "countdown-started" : ""}`} aria-label={countdown === "Started" ? "Match has started" : `Starts in ${countdown}`}>
    <Timer size={12} />
    <span>{countdown}</span>
  </span>;
}

function HistoryLeg({ label, odds, delta }: { label: string; odds: number; delta: number | null }) {
  return <div className="history-leg">
    <span className="history-leg-label">{label}</span>
    <strong>{formatMoneyline(odds)}</strong>
    <span className={`history-delta ${delta === null || delta === 0 ? "history-delta-neutral" : delta > 0 ? "history-delta-up" : "history-delta-down"}`}>{formatDelta(delta)}</span>
  </div>;
}

function OddsHistory({ match, now }: { match: Match; now: number }) {
  const [data, setData] = useState<OddsHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    if (loading || data) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(match.espn_event_id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      setData((await response.json()) as OddsHistoryResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load odds history.");
    } finally {
      setLoading(false);
    }
  }

  return <details className="signal-dropdown" onToggle={(event) => {
    if (event.currentTarget.open) void loadHistory();
  }}>
    <summary><span>Signal details</span>{match.odds && <span className="updated-time">Updated {relativeTime(match.odds.captured_at, now)}</span>}<ChevronDown className="dropdown-chevron" size={14} /></summary>
    <div className="signal-note"><SignalExplanation signal={match.signal as Signal} homeTeam={match.home_team} awayTeam={match.away_team} /></div>
    <div className="history-section">
      <div className="history-heading">
        <div><strong>Odds movement</strong><span>Only recorded when a price changes</span></div>
        {data && <span>{Math.max(0, data.snapshot_count - 1)} movements · {data.snapshot_count} snapshots</span>}
      </div>
      {loading && <div className="history-loading"><RefreshCw className="is-spinning" size={14} /> Loading price history…</div>}
      {error && <div className="history-error"><AlertCircle size={14} /><span>Couldn’t load price history.</span><button type="button" onClick={() => { setData(null); void loadHistory(); }}>Try again</button></div>}
      {data && [...data.history].reverse().map((snapshot, reverseIndex) => {
        const movementIndex = data.history.length - reverseIndex - 1;
        return <div className="history-row" key={snapshot.snapshot_id}>
          <div className="history-meta">
            <span className="history-sequence">{movementIndex === 0 ? "First snapshot" : `Movement ${movementIndex}`}</span>
          <time dateTime={snapshot.captured_at}>{formatSnapshotTime(snapshot.captured_at)}</time>
          <span className="history-age">{formatOddsAge(snapshot.captured_at, now)}</span>
            <span className={snapshot.signal.matched ? "history-signal-active" : "history-signal-quiet"}>{snapshot.signal.matched ? `${signalLabel(snapshot.signal)} active` : "No signal"}</span>
          </div>
          <div className="history-legs">
            <HistoryLeg label={match.home_team} odds={snapshot.home_ml} delta={snapshot.delta_home_ml} />
            <HistoryLeg label="Draw" odds={snapshot.draw_ml} delta={snapshot.delta_draw_ml} />
            <HistoryLeg label={match.away_team} odds={snapshot.away_ml} delta={snapshot.delta_away_ml} />
          </div>
        </div>;
      })}
      {data?.history.length === 0 && <div className="history-empty">No odds snapshots have been recorded yet.</div>}
    </div>
  </details>;
}

function SignalCard({ match, now }: { match: Match; now: number }) {
  const kickoff = formatKickoff(match.kickoff);
  const signal = match.signal as Signal;
  return <article className="signal-card">
    <div className="signal-accent" />
    <div className="card-topline"><div className="league-label"><LeagueMark league={match.league} /><span>{leagueMeta[match.league].name}</span></div><SignalBadge signal={signal} /></div>
    <div className="match-heading"><h3>{match.home_team}</h3><span>vs</span><h3>{match.away_team}</h3></div>
    <div className="kickoff-line"><CalendarDays size={14} /> {kickoff.date}<span className="line-divider" /><Clock3 size={14} /> {kickoff.time}<MatchCountdown kickoff={match.kickoff} now={now} /></div>
    <OddsRow odds={match.odds} homeTeam={match.home_team} awayTeam={match.away_team} highlighted={signal.predicted_side} />
    <OddsHistory match={match} now={now} />
  </article>;
}

function MatchCard({ match, now }: { match: Match; now: number }) {
  const kickoff = formatKickoff(match.kickoff);
  return <article className="match-card">
    <div className="match-info"><div className="league-label"><LeagueMark league={match.league} /><span>{leagueMeta[match.league].name}</span></div><h3>{match.home_team} <span>vs</span> {match.away_team}</h3><div className="kickoff-line"><CalendarDays size={14} /> {kickoff.date}<span className="line-divider" /><Clock3 size={14} /> {kickoff.time}<MatchCountdown kickoff={match.kickoff} now={now} /></div></div>
    <div className="match-odds"><OddsRow odds={match.odds} homeTeam={match.home_team} awayTeam={match.away_team} /></div>
    <div className="match-status"><SignalBadge signal={match.signal} />{match.odds && <span className="updated-time">Updated {relativeTime(match.odds.captured_at, now)}</span>}</div>
  </article>;
}

function LeagueFilter({ selected, onChange, matches }: { selected: League; onChange: (league: League) => void; matches: Match[] }) {
  const filters: { value: League; label: string }[] = [{ value: "all", label: "All" }, { value: "eng.1", label: "Premier League" }, { value: "esp.1", label: "La Liga" }, { value: "uefa.champions", label: "Champions League" }];
  return <div className="filter-shell" aria-label="Filter matches by league">{filters.map((filter) => {
    const count = filter.value === "all" ? matches.length : matches.filter((match) => match.league === filter.value).length;
    return <button className={selected === filter.value ? "filter-active" : ""} key={filter.value} onClick={() => onChange(filter.value)} type="button">{filter.label} <span>{count}</span></button>;
  })}</div>;
}

function LoadingState() {
  return <div className="loading-grid" aria-label="Loading matches">{[0, 1, 2].map((item) => <div className="loading-card" key={item}><div className="skeleton skeleton-small" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-odds" /></div>)}</div>;
}

export function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchMatches = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/pregame", { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      setData((await response.json()) as ApiResponse);
      setLastRefresh(Date.now());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh match data.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void fetchMatches(), 0);
    const refreshTimer = window.setInterval(() => void fetchMatches(), REFRESH_INTERVAL);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [fetchMatches]);

  const visibleMatches = useMemo(() => data?.matches.filter((match) => selectedLeague === "all" || match.league === selectedLeague) ?? [], [data, selectedLeague]);
  const signals = visibleMatches.filter((match) => match.signal?.matched);
  const upcoming = visibleMatches.filter((match) => !match.signal?.matched);

  return <main className="dashboard-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="dashboard-container">
      <header className="site-header">
        <div className="brand-block"><div className="brand-icon"><Shield size={20} strokeWidth={2.2} /></div><div><div className="eyebrow">Soccer Signals</div><h1>Pregame Odds Monitor</h1></div></div>
        <div className="header-actions"><div className="live-count"><span className="live-dot" /><strong>{data?.count ?? 0}</strong> upcoming matches</div><button className="refresh-button" disabled={refreshing} onClick={() => void fetchMatches()} title="Refresh odds" type="button"><RefreshCw className={refreshing ? "is-spinning" : ""} size={16} /><span>Refresh</span></button></div>
      </header>
      <div className="toolbar"><LeagueFilter matches={data?.matches ?? []} onChange={setSelectedLeague} selected={selectedLeague} /><div className="refresh-meta"><Clock3 size={14} />{lastRefresh ? `Synced ${relativeTime(new Date(lastRefresh).toISOString(), now)}` : "Waiting for data"}</div></div>
      {error && <div className="error-banner" role="status"><AlertCircle size={16} /><span>{data ? "Latest refresh failed. Showing the last successful update." : error}</span><button onClick={() => void fetchMatches()} type="button">Try again</button></div>}
      {loading && !data ? <LoadingState /> : <>
        <section className="content-section">
          <div className="section-heading"><div><span className="section-kicker section-kicker-active">Live signals</span><h2>Active opportunities</h2><p>Matches where the current market meets your signal rules.</p></div><div className="section-count active-count">{signals.length} active</div></div>
          {signals.length > 0 ? <div className="signal-grid">{signals.map((match) => <SignalCard key={match.id} match={match} now={now} />)}</div> : <div className="empty-state"><Activity size={20} /><div><strong>No active signals</strong><span>There are no matches triggering the rule in this league.</span></div></div>}
        </section>
        <section className="content-section upcoming-section">
          <div className="section-heading"><div><span className="section-kicker">Upcoming schedule</span><h2>All other matches</h2><p>Current three-way moneylines for the next 3 days.</p></div><div className="section-count">{upcoming.length} matches</div></div>
          <div className="matches-list">{upcoming.map((match) => <MatchCard key={match.id} match={match} now={now} />)}</div>
          {upcoming.length === 0 && <div className="empty-state"><CalendarDays size={20} /><strong>No upcoming matches in this league.</strong></div>}
        </section>
      </>}
      <footer><span>Auto-refreshes every 60 seconds</span><span className="footer-divider" /><span>Times shown in your local timezone</span><ArrowUpRight size={13} /></footer>
    </div>
  </main>;
}
