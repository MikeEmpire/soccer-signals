import { Activity, CalendarDays, ChevronDown } from "lucide-react";
import { formatValue, moneyline, ODDS_LEAGUES, predictedTeam, readable, type JsonValue, type OddsEvent, type OddsSignal } from "../../lib/odds";

function Fields({ fields }: { fields: [string, JsonValue | undefined][] }) {
  return <dl className="trigger-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>)}</dl>;
}

function SignalDetails({ event, signal }: { event: OddsEvent; signal: OddsSignal }) {
  const team = predictedTeam(event, signal.predicted_side);
  const description = signal.description || signal.reason || "No description supplied.";
  const labels: Record<string, string> = { favorite_win: "Favorite to win", underdog_upset: "Underdog upset chance", home_win: "Home team to win", away_win: "Away team to win", favorite_cover: "Favorite to cover" };
  return <div className="event-signal">
    <div className="signal-summary"><Activity size={14} /><strong>{labels[signal.type] ?? readable(signal.type)}</strong><span className="predicted-team">{team}</span></div>
    <p className="market-caption">{readable(signal.market)} · {readable(signal.prediction)}</p>
    <p className="signal-explanation">{description}</p>
    <details className="signal-dropdown"><summary>Why this signal?<ChevronDown className="dropdown-chevron" size={14} /></summary>
      <Fields fields={[
        ["Rule key", signal.rule], ["Description", description], ["Predicted side / team", `${signal.predicted_side ?? "—"} / ${team}`],
        ["Market", readable(signal.market)], ["Prediction", readable(signal.prediction)], ["Confidence", signal.confidence],
        ["Observed value", signal.observed_value], ["Configured threshold", signal.threshold],
      ]} />
      <h4>Context</h4>
      {Object.keys(signal.context ?? {}).length ? <Fields fields={Object.entries(signal.context ?? {}).map(([key, value]) => [readable(key), value])} /> : <p className="context-note">No context supplied.</p>}
      {process.env.NODE_ENV !== "production" && <details className="raw-context"><summary>Raw context JSON</summary><pre>{JSON.stringify(signal.context ?? {}, null, 2)}</pre></details>}
    </details>
  </div>;
}

function MLBContext({ event }: { event: OddsEvent }) {
  const context = event.matchup_context;
  return <div className="mlb-context"><h4>Starting pitchers</h4><div className="pitcher-grid">{(["away", "home"] as const).map((side) => {
    const pitcher = context?.starting_pitchers?.[side];
    return <div className="pitcher-card" key={side}><span className="context-team">{event[`${side}_team`]}</span><span className="team-record">Team record: {context?.teams?.[side]?.record ?? "—"}</span><strong>{pitcher?.name || "TBD"}</strong><span>Pitcher record: {pitcher?.record ?? (pitcher?.wins != null && pitcher?.losses != null ? `${pitcher.wins}-${pitcher.losses}` : "—")}</span>{pitcher?.era != null && <span>ERA {pitcher.era.toFixed(2)}</span>}{pitcher?.whip != null && <span>WHIP {pitcher.whip.toFixed(2)}</span>}{!pitcher?.name && <span>Probable pitcher not available</span>}</div>;
  })}</div>
    <details className="signal-dropdown"><summary>Injuries<ChevronDown className="dropdown-chevron" size={14} /></summary>{(["away", "home"] as const).map((side) => {
      const injuries = context?.injuries?.[side];
      return <div key={side}><h4>{event[`${side}_team`]}</h4>{injuries == null ? <p className="context-note">Injury data not available.</p> : injuries.length === 0 ? <p className="context-note">No active injuries reported.</p> : <ul className="injury-list">{injuries.map((injury, index) => <li key={`${injury.player_id}-${index}`}><strong>{injury.player_name}</strong>{injury.position && ` · ${injury.position}`}<span>{[injury.status, injury.injury].filter(Boolean).join(" · ") || "Details unavailable"}</span>{injury.expected_return && <span>Expected return: {injury.expected_return}</span>}</li>)}</ul>}</div>;
    })}</details>
  </div>;
}

export function OddsEventCard({ event, onRetry, refreshing = false }: { event: OddsEvent; onRetry: () => void; refreshing?: boolean }) {
  const meta = ODDS_LEAGUES.find((league) => league.league === event.league);
  const signals = event.signals ?? [];
  const exclusions = event.signal_exclusions ?? [];
  const status = event.odds_status ?? "unknown";
  const odds = status === "available" ? event.odds : null;
  const start = new Date(event.start_time);
  const captured = event.odds?.captured_at ? new Date(event.odds.captured_at) : null;
  const prices = [{ side: "away", label: event.away_team, value: odds?.away_ml }, ...(event.sport === "soccer" && odds?.draw_ml != null ? [{ side: "draw", label: "Draw", value: odds.draw_ml }] : []), { side: "home", label: event.home_team, value: odds?.home_ml }];
  return <article className="signal-card odds-event-card">
    {signals.length > 0 && <div className="signal-accent" />}
    <div className="card-topline"><div className="league-label"><span className={`league-mark league-${event.sport}`}>{meta?.mark ?? "—"}</span>{meta?.label ?? readable(event.league)}</div><span className={`status-badge ${signals.length ? "status-active" : "status-quiet"}`}>{event.signal_count ?? signals.length} signals</span></div>
    <div className="match-heading"><h3>{event.away_team}</h3><span>at</span><h3>{event.home_team}</h3></div>
    <div className="kickoff-line"><CalendarDays size={14} />{Number.isNaN(start.getTime()) ? "Start time TBD" : <time dateTime={event.start_time}>{start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>}</div>
    {(status !== "available" || !odds) && <div className="odds-state" role="status">{status === "error" ? "Couldn’t load odds." : status === "unavailable" ? "Odds unavailable." : "Odds pending."}{event.odds_status_reason && <span> {event.odds_status_reason}</span>}{status === "error" && <button type="button" disabled={refreshing} onClick={onRetry}>Retry odds</button>}</div>}
    <div className="odds-row" style={{ gridTemplateColumns: `repeat(${prices.length}, minmax(0, 1fr))` }}>{prices.map((price) => <div className="odds-cell" key={price.side}><div className="odds-label">{price.label}</div><div className="odds-value">{moneyline(price.value)}</div><div className="odds-opening">Moneyline</div></div>)}</div>
    {odds && (odds.away_spread != null || odds.home_spread != null) && <div className="additional-market"><h4>{event.sport === "baseball" ? "Run line" : "Spread"}</h4><div className="market-pair"><span>{event.away_team}<strong>{moneyline(odds.away_spread)} <small>({moneyline(odds.away_spread_ml)})</small></strong></span><span>{event.home_team}<strong>{moneyline(odds.home_spread)} <small>({moneyline(odds.home_spread_ml)})</small></strong></span></div></div>}
    {odds?.total_line != null && <div className="additional-market"><h4>Total {odds.total_line}</h4><div className="market-pair"><span>Over<strong>{moneyline(odds.over_ml)}</strong></span><span>Under<strong>{moneyline(odds.under_ml)}</strong></span></div></div>}
    <p className="context-note">{captured && !Number.isNaN(captured.getTime()) ? <>Odds captured <time dateTime={event.odds?.captured_at ?? undefined}>{captured.toLocaleString()}</time>{event.odds?.line_phase === "archived" && " · Archived"}{event.odds?.is_backfill && " · Backfill"}</> : "Odds freshness unavailable"}</p>
    {signals.map((signal, index) => <SignalDetails key={`${signal.rule}-${index}`} signal={signal} event={event} />)}
    {signals.length === 0 && exclusions.length === 0 && <p className="quiet-signals">No active signals</p>}
    {exclusions.length > 0 && <div className="signal-exclusions"><span className="status-badge status-unavailable">Filtered signal</span>{exclusions.map((exclusion, index) => <p key={`${exclusion.rule}-${index}`}>{exclusion.description}</p>)}</div>}
    {event.sport === "baseball" && <MLBContext event={event} />}
  </article>;
}
