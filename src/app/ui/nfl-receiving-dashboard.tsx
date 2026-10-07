"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Shield } from "lucide-react";
import { loadReceivingFeed, parseReceivingFeed, PROP_LABELS, type NFLFamily, type Prop, type ReceivingFeed } from "../../lib/nfl-receiving";
import rushingExample from "../../lib/nfl-rushing-example.json";
import attemptsExample from "../../lib/nfl-attempts-example.json";
import touchdownExample from "../../lib/nfl-touchdown-example.json";
import { NFLTouchdownCard } from "./nfl-touchdown-card";
import example from "../../lib/nfl-receiving-example.json";
import { NFLReceivingCard } from "./nfl-receiving-card";

const sampleFeeds = { receiving: parseReceivingFeed(example), rushing: parseReceivingFeed({ ...rushingExample, signals: [...rushingExample.signals, ...attemptsExample.signals] }, "rushing"), "anytime-td": parseReceivingFeed(touchdownExample, "anytime-td") };

export function NFLReceivingDashboard() {
  const [prop, setProp] = useState<"all" | Prop>("all");
  const [preview, setPreview] = useState(false);
  const family: NFLFamily = prop === "anytime_td" ? "anytime-td" : prop === "rushing_yards" || prop === "rushing_attempts" ? "rushing" : "receiving";
  return <NFLFamilyDashboard key={family} family={family} prop={prop} onPropChange={setProp} preview={preview} onPreviewChange={setPreview} />;
}

function NFLFamilyDashboard({ family, prop, onPropChange, preview, onPreviewChange: setPreview }: {
  family: NFLFamily;
  prop: "all" | Prop;
  onPropChange: (prop: "all" | Prop) => void;
  preview: boolean;
  onPreviewChange: (preview: boolean) => void;
}) {
  const rushing = family === "rushing";
  const touchdown = family === "anytime-td";
  const [feed, setFeed] = useState<ReceivingFeed | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(0);
  const expiryRefresh = useRef("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (preview) return;
    let active = true;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setLoading(true);
      try {
        const next = await loadReceivingFeed(current.signal, family);
        if (active && !current.signal.aborted) { setFeed(next); setError(""); setNow(Date.now()); }
      } catch (err) {
        if (active && !current.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load NFL research.");
      } finally { if (active && !current.signal.aborted) setLoading(false); }
    };
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(visibleRefresh, 60000);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visibleRefresh); };
  }, [preview, refreshKey, family]);
  useEffect(() => {
    if (preview || loading || error || !feed || !now || document.visibilityState !== "visible") return;
    const expired = feed.signals.filter(card =>
      (card.market.consensus_expires_at && Date.parse(card.market.consensus_expires_at) <= now) ||
      (card.lock_at && Date.parse(card.lock_at) <= now && card.live_signal != null)).map(card => `${card.id}:${card.market.consensus_expires_at}:${card.lock_at}`).sort().join("|");
    if (expired && expiryRefresh.current !== expired) {
      expiryRefresh.current = expired;
      setRefreshKey(key => key + 1);
    }
  }, [preview, loading, error, feed, now]);
  const data = preview ? sampleFeeds[family] : feed;
  const windowHours = data?.window_hours ?? 72;
  const signals = data?.signals.filter(s => prop === "all" || s.prop === prop) ?? [];
  const sampleTime = Date.parse(sampleFeeds[family].generated_at);
  return <div className="dashboard-shell receiving-page"><div className="ambient ambient-one" /><main className="dashboard-container">
    <header className="site-header"><div className="brand-block"><div className="brand-icon"><Shield size={20} /></div><div><div className="eyebrow">Sports Signals · Research V1</div><h1>NFL Props Research</h1></div></div>
      <button className="refresh-button" disabled={preview || loading} onClick={() => setRefreshKey(n => n+1)}><RefreshCw size={16} className={loading && !preview ? "is-spinning" : ""} /><span>Refresh</span></button></header>
    <nav className="page-nav" aria-label="Site sections"><Link href="/" className="page-nav-link">Live Odds</Link><Link href="/review" className="page-nav-link">Daily Review</Link><span className="page-nav-link page-nav-active" aria-current="page">NFL Props</span></nav>
    <section className="receiving-intro"><div><span className="section-kicker">{preview ? "Sample preview" : `Next ${windowHours} hours`}</span><h2>{touchdown ? "Anytime touchdown research, with the evidence." : rushing ? "RB rushing props, with the evidence." : "Receiving props, with the evidence."}</h2><p>ESPN-derived projections alongside DraftKings, FanDuel and Bovada. Explore the numbers behind each player.</p></div>
      <div className="filter-shell" role="group" aria-label="Data source"><button className={!preview ? "filter-active" : ""} aria-pressed={!preview} onClick={() => setPreview(false)}>Live</button><button className={preview ? "filter-active" : ""} aria-pressed={preview} onClick={() => setPreview(true)}>Sample preview</button></div></section>
    {preview && <div className="receiving-sample" role="status"><strong>Sample data · Not current NFL signals</strong><span>A synthetic player and illustrative matchup demonstrate the calculated output. These are fixed examples, not live forecasts.</span></div>}
    {!preview && error && <div className="receiving-error" role="alert">{error} {feed ? "Showing saved projections and labeled last-saved prices; live comparisons are hidden until refresh succeeds." : "You can open Sample preview to explore the interface."}<button onClick={() => setRefreshKey(n => n+1)}>Retry</button></div>}
    <div className="receiving-toolbar"><div className="filter-shell" role="group" aria-label="Prop type">{(["all", "receiving_yards", "receptions", "rushing_yards", "rushing_attempts", "anytime_td"] as const).map(value => <button key={value} aria-pressed={prop === value} className={prop === value ? "filter-active" : ""} onClick={() => onPropChange(value)}>{value === "all" ? "All receiving" : PROP_LABELS[value]}</button>)}</div>
      <span className="refresh-meta">{preview ? "Fixed example dataset" : loading ? "Refreshing…" : data ? `Response ${new Date(data.generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · refreshes every minute` : "Waiting for data"}</span></div>
    {data && <div className="receiving-summary"><span><strong>{data.game_count}</strong> {preview ? "illustrative matchup" : "upcoming games"}</span><span><strong>{signals.filter(card => card.available || card.projection.conditional_on_playing != null).length}</strong> projections available</span><span>{touchdown ? "1 touchdown market" : rushing ? "2 rushing markets" : "2 receiving markets"} · 3 supported books</span></div>}
    {!preview && !data && loading && <div className="receiving-empty" role="status"><h3>Loading upcoming NFL research…</h3><p>Checking stored games and pregame projections.</p></div>}
    {data?.games.length === 0 && <div className="receiving-empty"><h3>No NFL games in the next {windowHours} hours</h3><p>The stored schedule has no upcoming matchups in this window. Check back closer to kickoff, or open Sample preview.</p></div>}
    {data?.games.map(game => { const cards = signals.filter(s => s.game_id === game.id); return <section className="content-section" key={game.id}>
      <div className="section-heading"><div><span className="section-kicker">{new Date(game.kickoff).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · {new Date(game.kickoff).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</span><h2>{game.name || "Upcoming NFL matchup"}</h2></div><span className="section-count">{cards.length} player props</span></div>
      {cards.length ? <div className="signal-grid">{cards.map(card => card.prop === "anytime_td" ? <NFLTouchdownCard key={card.id} card={card} matchup={game.name} now={preview ? sampleTime : now} sample={preview} outdated={Boolean(error) && !preview} /> : <NFLReceivingCard key={card.id} card={card} matchup={game.name} now={preview ? sampleTime : now} sample={preview} outdated={Boolean(error) && !preview} />)}</div> : <div className="receiving-empty"><h3>{touchdown ? "Touchdown" : rushing ? "Rushing" : "Receiving"} research is pending</h3><p>Player props will appear when verified markets and pregame research data are available for this matchup.</p></div>}
    </section>; })}
    {process.env.NEXT_PUBLIC_API_BASE_URL && <p className="receiving-note"><a href={`${process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "")}/admin/odds/nflreceivingofficial/research/`} target="_blank" rel="noreferrer">Historical results · Staff research dashboard</a> · Sign in with your backend staff account. Results, grades and CLV are supplied by the backend.</p>}
    <footer><span>Research estimates · No calibrated probabilities or betting recommendations.</span><Link href="/">Back to live odds</Link></footer>
  </main></div>;
}
