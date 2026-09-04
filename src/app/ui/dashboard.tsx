"use client";

import Link from "next/link";
import { Activity, AlertCircle, Clock3, RefreshCw, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFeedLoader, groupEvents, ODDS_LEAGUES, type OddsFeedResponse, type OddsLeague } from "../../lib/odds";
import { OddsEventCard } from "./odds-event-card";

export function Dashboard() {
  const [selected, setSelected] = useState<OddsLeague>(ODDS_LEAGUES[0]);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<OddsFeedResponse | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [loader] = useState(() => createFeedLoader());

  const changeLeague = useCallback((league: OddsLeague) => {
    loader.cancel(); setSelected(league); setData(null); setError(null); setLastRefresh(null); setRefreshing(true);
  }, [loader]);

  useEffect(() => {
    const restore = () => {
      let key = new URLSearchParams(window.location.search).get("league");
      if (!key) {
        try { key = window.sessionStorage.getItem("odds-league"); } catch { /* URL navigation still works when storage is disabled. */ }
      }
      changeLeague(ODDS_LEAGUES.find((league) => league.key === key) ?? ODDS_LEAGUES[0]);
      setReady(true);
    };
    const timer = window.setTimeout(restore, 0);
    window.addEventListener("popstate", restore);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", restore); };
  }, [changeLeague]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void loader.load(selected, (feed) => { setData(feed); setError(null); setLastRefresh(new Date()); }, setError, () => setRefreshing(false));
  }, [loader, selected]);

  useEffect(() => {
    if (!ready) return;
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); loader.cancel(); };
  }, [loader, ready, refresh]);

  const groups = groupEvents(data?.events ?? []);
  return <main className="dashboard-shell" onTouchStart={(event) => {
    touchStart.current = window.scrollY <= 0 && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }} onTouchMove={(event) => {
    if (!touchStart.current) return;
    if (event.touches.length !== 1 || Math.abs(event.touches[0].clientX - touchStart.current.x) > 40) { touchStart.current = null; setPullDistance(0); return; }
    setPullDistance(Math.max(0, Math.min(100, event.touches[0].clientY - touchStart.current.y)));
  }} onTouchEnd={() => { if (pullDistance >= 75 && !refreshing && ready) refresh(); touchStart.current = null; setPullDistance(0); }} onTouchCancel={() => { touchStart.current = null; setPullDistance(0); }}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="dashboard-container">
      <header className="site-header"><div className="brand-block"><div className="brand-icon"><Shield size={20} /></div><div><div className="eyebrow">Sports Signals</div><h1>Pregame Odds Monitor</h1></div></div><div className="header-actions"><div className="live-count"><span className="live-dot" /><strong>{data?.count ?? 0}</strong> upcoming events</div><button className="refresh-button" type="button" disabled={refreshing || !ready} onClick={refresh} aria-label="Refresh odds"><RefreshCw size={16} className={refreshing ? "is-spinning" : ""} /><span>Refresh</span></button></div></header>
      <div className="toolbar"><nav className="filter-shell odds-league-filter" aria-label="Odds leagues">{ODDS_LEAGUES.map((league) => <button type="button" key={league.key} aria-pressed={selected.key === league.key} className={selected.key === league.key ? "filter-active" : ""} onClick={() => {
        if (league.key === selected.key) return;
        const url = new URL(window.location.href); url.searchParams.set("league", league.key); window.history.pushState(null, "", url);
        try { window.sessionStorage.setItem("odds-league", league.key); } catch { /* Selection remains in the URL. */ }
        changeLeague(league);
      }}>{league.label}</button>)}</nav><div className="refresh-meta"><Clock3 size={14} />{lastRefresh ? `Synced ${lastRefresh.toLocaleTimeString()}` : "Waiting for data"}</div></div>
      {pullDistance > 0 && <p className="pull-status" role="status">{pullDistance >= 75 ? "Release to refresh" : "Pull to refresh"}</p>}
      {error && <div className="error-banner" role="alert"><AlertCircle size={16} /><span>{data ? "Latest refresh failed. Showing the last successful update." : error}</span><button type="button" disabled={refreshing} onClick={refresh}>Try again</button></div>}
      <div className="section-heading"><div><span className="section-kicker section-kicker-active">{selected.label}</span><h2>Pregame opportunities</h2><p>{data ? <>Feed window: <time dateTime={data.window_start_date}>{data.window_start_date}</time> – <time dateTime={data.window_end_date}>{data.window_end_date}</time></> : "Today and the next two days"}</p></div>{data && <span className="section-count active-count">{data.signal_count} signals</span>}</div>
      <div aria-busy={refreshing}>
        {!data && refreshing && <div className="loading-grid" role="status" aria-label="Loading events">{[0, 1].map((item) => <div className="loading-card" key={item}><div className="skeleton skeleton-small" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-odds" /></div>)}</div>}
        {data && groups.length === 0 && <div className="empty-state"><Activity size={20} /><div><strong>No upcoming events</strong><span>No events are available for {selected.label} in this feed window.</span></div></div>}
        {groups.map((group) => <section className="content-section day-section" key={group.key}><div className="day-heading"><h2>{group.label}</h2><span>{group.events.length} events</span></div><div className="signal-grid">{group.events.map((event) => <OddsEventCard key={`${event.provider ?? "event"}-${event.id}`} event={event} onRetry={refresh} refreshing={refreshing} />)}</div></section>)}
      </div>
      <footer><span>Auto-refreshes every 60 seconds</span><span className="footer-divider" /><span>Times shown in your local timezone</span><Link href="/soccer">Soccer monitor & history</Link></footer>
    </div>
  </main>;
}
