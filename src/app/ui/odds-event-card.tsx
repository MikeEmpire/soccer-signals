import { SignalDetails } from "./odds-signal";
import { OddsHistory } from "./odds-history";
import { CalendarDays, ChevronDown } from "lucide-react";
import { moneyline, ODDS_LEAGUES, percentage, percentagePoints, probabilityPercentage, readable, type BettingSplitSide, type OddsEvent } from "../../lib/odds";

function MarketOutlook({ event }: { event: OddsEvent }) {
  if (!event.market_outlook) return null;
  return <div className="market-outlook"><h4>Market-implied win probability</h4><p>Odds-based estimates after sportsbook-margin removal.</p><div className="probability-grid">
    <div><span>{event.away_team}</span><strong>{probabilityPercentage(event.market_outlook.away_implied_probability)}</strong></div>
    <div><span>{event.home_team}</span><strong>{probabilityPercentage(event.market_outlook.home_implied_probability)}</strong></div>
  </div></div>;
}

function SplitRow({ team, split }: { team: string; split: BettingSplitSide | null | undefined }) {
  return <div className="split-row"><strong>{team}</strong><span>{percentage(split?.bet_pct)}{split?.bet_pct_change != null && <small>{percentagePoints(split.bet_pct_change)}</small>}</span><span>{percentage(split?.handle_pct)}{split?.handle_pct_change != null && <small>{percentagePoints(split.handle_pct_change)}</small>}</span><span>{percentagePoints(split?.money_differential)}</span></div>;
}

function BettingSplitsPanel({ event }: { event: OddsEvent }) {
  const splits = event.betting_splits;
  const status = splits?.status;
  const hasValues = status === "fresh" || status === "stale";
  const lastChecked = splits?.last_checked_at ? new Date(splits.last_checked_at) : null;
  const beyondFreshness = splits?.age_seconds != null && splits?.max_age_seconds != null && splits.age_seconds > splits.max_age_seconds;
  const message = status === "unavailable" ? "Betting splits are not available for this game yet."
    : status === "invalid_moneyline" ? "Moneyline splits are incomplete or invalid."
    : status === "disabled" ? "Betting splits are currently disabled."
    : !hasValues ? "Betting splits are not available for this game yet." : null;
  return <details className="betting-splits signal-dropdown"><summary>Betting splits <span className="split-source">VSiN · DraftKings</span>{status === "stale" && <span className="status-badge status-unavailable">Out of date</span>}<ChevronDown className="dropdown-chevron" size={14} /></summary>
    {message ? <p className="split-state">{message}</p> : <><div className="split-legend">Bets = share of tickets · Money = share of wagered dollars</div><div className="split-table">
      <div className="split-row split-header"><strong>Team</strong><span>Bets</span><span>Money</span><span>Money − Bets</span></div>
      <SplitRow team={event.away_team} split={splits?.moneyline?.away} /><SplitRow team={event.home_team} split={splits?.moneyline?.home} />
    </div>{splits?.signal_eligible === true && <p className="split-eligible">Eligible for split-based signals</p>}</>}
    <p className="split-timestamp">{lastChecked && !Number.isNaN(lastChecked.getTime()) ? <>Last checked <time dateTime={splits?.last_checked_at ?? undefined}>{lastChecked.toLocaleString()}</time>{beyondFreshness && " · Past freshness window"}</> : "Last checked unavailable"}</p>
  </details>;
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

export function OddsEventCard({ event, onRetry, refreshing = false, dataOutdated = false }: { event: OddsEvent; onRetry: () => void; refreshing?: boolean; dataOutdated?: boolean }) {
  const meta = ODDS_LEAGUES.find((league) => league.league === event.league);
  const signals = event.signals ?? [];
  const exclusions = event.signal_exclusions ?? [];
  const status = event.odds_status ?? "unknown";
  const odds = status === "available" ? event.odds : null;
  const start = new Date(event.start_time);
  const captured = event.odds?.captured_at ? new Date(event.odds.captured_at) : null;
  const prices = [{ side: "away", label: event.away_team, value: odds?.away_ml, opening: event.odds?.open_away_ml }, ...(event.sport === "soccer" && (odds?.draw_ml != null || event.odds?.open_draw_ml != null) ? [{ side: "draw", label: "Draw", value: odds?.draw_ml, opening: event.odds?.open_draw_ml }] : []), { side: "home", label: event.home_team, value: odds?.home_ml, opening: event.odds?.open_home_ml }];
  return <article className="signal-card odds-event-card">
    {signals.length > 0 && <div className="signal-accent" />}
    <div className="card-topline"><div className="league-label"><span className={`league-mark league-${event.sport}`}>{meta?.mark ?? "—"}</span>{meta?.label ?? readable(event.league)}</div><span className={`status-badge ${signals.length ? "status-active" : "status-quiet"}`}>{signals.length} signals</span></div>
    {dataOutdated && <p className="cached-warning" role="status">Cached data · latest refresh failed</p>}
    <div className="match-heading"><h3>{event.away_team}</h3><span>at</span><h3>{event.home_team}</h3></div>
    <div className="kickoff-line"><CalendarDays size={14} />{Number.isNaN(start.getTime()) ? "Start time TBD" : <time dateTime={event.start_time}>{start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>}</div>
    {(status !== "available" || !odds) && <div className="odds-state" role="status">{status === "error" ? "Couldn’t load odds." : status === "unavailable" ? "Odds unavailable." : "Odds pending."}{event.odds_status_reason && <span> {event.odds_status_reason}</span>}{status === "error" && <button type="button" disabled={refreshing} onClick={onRetry}>Retry odds</button>}</div>}
    <div className="odds-row" style={{ gridTemplateColumns: `repeat(${prices.length}, minmax(0, 1fr))` }}>{prices.map((price) => <div className="odds-cell" key={price.side}><div className="odds-label">{price.label}</div><div className="moneyline-comparison"><div><span>Opening</span><strong>{moneyline(price.opening)}</strong></div><div><span>Current</span><strong className="odds-value">{moneyline(price.value)}</strong></div></div></div>)}</div>
    {odds && (odds.away_spread != null || odds.home_spread != null) && <div className="additional-market"><h4>{event.sport === "baseball" ? "Run line" : "Spread"}</h4><div className="market-pair"><span>{event.away_team}<strong>{moneyline(odds.away_spread)} <small>({moneyline(odds.away_spread_ml)})</small></strong></span><span>{event.home_team}<strong>{moneyline(odds.home_spread)} <small>({moneyline(odds.home_spread_ml)})</small></strong></span></div></div>}
    {odds?.total_line != null && <div className="additional-market"><h4>Total {odds.total_line}</h4><div className="market-pair"><span>Over<strong>{moneyline(odds.over_ml)}</strong></span><span>Under<strong>{moneyline(odds.under_ml)}</strong></span></div></div>}
    <p className="context-note">{captured && !Number.isNaN(captured.getTime()) ? <>Odds captured <time dateTime={event.odds?.captured_at ?? undefined}>{captured.toLocaleString()}</time>{event.odds?.line_phase === "archived" && " · Archived"}{event.odds?.is_backfill && " · Backfill"}</> : "Odds freshness unavailable"}</p>
    <OddsHistory event={event} />
    {event.sport === "baseball" && <MarketOutlook event={event} />}
    {signals.map((signal, index) => <SignalDetails key={`${signal.rule}-${index}`} signal={signal} event={event} />)}
    {signals.length === 0 && exclusions.length === 0 && <p className="quiet-signals">No active signals</p>}
    {exclusions.length > 0 && <div className="signal-exclusions"><span className="status-badge status-unavailable">Filtered signal</span>{exclusions.map((exclusion, index) => <p key={`${exclusion.rule}-${index}`}>{exclusion.description}</p>)}</div>}
    {event.sport === "baseball" && <BettingSplitsPanel event={event} />}
    {event.sport === "baseball" && <MLBContext event={event} />}
  </article>;
}
