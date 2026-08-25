"use client";

import { Activity, AlertCircle, ArrowUpRight, CalendarDays, Check, Clock3, RefreshCw, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type League = "all" | "eng.1" | "esp.1";
type SignalType = "draw" | "home_win" | "away_win" | "none";
type Odds = { home_ml: number; draw_ml: number; away_ml: number; open_home_ml: number | null; open_draw_ml: number | null; open_away_ml: number | null; captured_at: string };
type Signal = { type: SignalType; matched: boolean; draw_gap: number; higher_ml_side: "home" | "away"; higher_team_ml: number; other_team_ml: number; predicted_side: "home" | "away" | "draw" | null };
type Match = { id: number; espn_event_id: string; league: Exclude<League, "all">; kickoff: string; home_team: string; away_team: string; odds: Odds | null; signal: Signal | null };
type ApiResponse = { count: number; upcoming_days: number; matches: Match[] };

const REFRESH_INTERVAL = 60_000;
const leagueMeta = {
  "eng.1": { name: "Premier League", mark: "PL" },
  "esp.1": { name: "La Liga", mark: "LL" },
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
  return <span className={`league-mark league-${league === "eng.1" ? "epl" : "laliga"}`}>{leagueMeta[league].mark}</span>;
}

function OddsRow({ odds, highlighted }: { odds: Odds | null; highlighted?: Signal["predicted_side"] }) {
  const columns = [
    { key: "home", label: "Home", current: odds?.home_ml, opening: odds?.open_home_ml },
    { key: "draw", label: "Draw", current: odds?.draw_ml, opening: odds?.open_draw_ml },
    { key: "away", label: "Away", current: odds?.away_ml, opening: odds?.open_away_ml },
  ] as const;
  return <div className="odds-row">{columns.map((column) => (
    <div className={`odds-cell ${highlighted === column.key ? "odds-highlighted" : ""}`} key={column.key}>
      <div className="odds-label">{column.label}{highlighted === column.key && <Check size={11} strokeWidth={3} />}</div>
      <div className="odds-value">{formatMoneyline(column.current)}</div>
      <div className="odds-opening">{column.opening == null ? "Opening —" : `Open ${formatMoneyline(column.opening)}`}</div>
    </div>
  ))}</div>;
}

function SignalExplanation({ signal }: { signal: Signal }) {
  const higherSide = signal.higher_ml_side === "home" ? "Home" : "Away";
  const oppositeSide = signal.higher_ml_side === "home" ? "Away" : "Home";
  return <p className="signal-explanation">Draw is <strong>{signal.draw_gap} points</strong> from {higherSide} <strong>{formatMoneyline(signal.higher_team_ml)}</strong>. Opposite side is {oppositeSide} <strong>{formatMoneyline(signal.other_team_ml)}</strong>.</p>;
}

function SignalCard({ match, now }: { match: Match; now: number }) {
  const kickoff = formatKickoff(match.kickoff);
  const signal = match.signal as Signal;
  return <article className="signal-card">
    <div className="signal-accent" />
    <div className="card-topline"><div className="league-label"><LeagueMark league={match.league} /><span>{leagueMeta[match.league].name}</span></div><SignalBadge signal={signal} /></div>
    <div className="match-heading"><h3>{match.home_team}</h3><span>vs</span><h3>{match.away_team}</h3></div>
    <div className="kickoff-line"><CalendarDays size={14} /> {kickoff.date}<span className="line-divider" /><Clock3 size={14} /> {kickoff.time}</div>
    <OddsRow odds={match.odds} highlighted={signal.predicted_side} />
    <div className="signal-note"><SignalExplanation signal={signal} />{match.odds && <span className="updated-time">Updated {relativeTime(match.odds.captured_at, now)}</span>}</div>
  </article>;
}

function MatchCard({ match, now }: { match: Match; now: number }) {
  const kickoff = formatKickoff(match.kickoff);
  return <article className="match-card">
    <div className="match-info"><div className="league-label"><LeagueMark league={match.league} /><span>{leagueMeta[match.league].name}</span></div><h3>{match.home_team} <span>vs</span> {match.away_team}</h3><div className="kickoff-line"><CalendarDays size={14} /> {kickoff.date}<span className="line-divider" /><Clock3 size={14} /> {kickoff.time}</div></div>
    <div className="match-odds"><OddsRow odds={match.odds} /></div>
    <div className="match-status"><SignalBadge signal={match.signal} />{match.odds && <span className="updated-time">Updated {relativeTime(match.odds.captured_at, now)}</span>}</div>
  </article>;
}

function LeagueFilter({ selected, onChange, matches }: { selected: League; onChange: (league: League) => void; matches: Match[] }) {
  const filters: { value: League; label: string }[] = [{ value: "all", label: "All" }, { value: "eng.1", label: "Premier League" }, { value: "esp.1", label: "La Liga" }];
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
    const clockTimer = window.setInterval(() => setNow(Date.now()), 30_000);
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
          <div className="section-heading"><div><span className="section-kicker">Upcoming schedule</span><h2>All other matches</h2><p>Current three-way moneylines for the next {data?.upcoming_days ?? 7} days.</p></div><div className="section-count">{upcoming.length} matches</div></div>
          <div className="matches-list">{upcoming.map((match) => <MatchCard key={match.id} match={match} now={now} />)}</div>
          {upcoming.length === 0 && <div className="empty-state"><CalendarDays size={20} /><strong>No upcoming matches in this league.</strong></div>}
        </section>
      </>}
      <footer><span>Auto-refreshes every 60 seconds</span><span className="footer-divider" /><span>Times shown in your local timezone</span><ArrowUpRight size={13} /></footer>
    </div>
  </main>;
}
