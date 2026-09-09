import { Activity, ChevronDown } from "lucide-react";
import { formatValue, moneyline, predictedTeam, readable, signalRuleLabel, type JsonValue, type OddsEvent, type OddsSignal } from "../../lib/odds";

function Fields({ fields }: { fields: [string, JsonValue | undefined][] }) {
  return <dl className="trigger-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>)}</dl>;
}

export function SignalDetails({ event, signal }: { event: Pick<OddsEvent, "home_team" | "away_team" | "sport">; signal: OddsSignal }) {
  const matchTotal = event.sport === "soccer" && signal.market === "total" && signal.prediction === "over_1_5";
  const team = matchTotal ? "Match total over 1.5 goals" : predictedTeam(event, signal.predicted_side);
  const tier = signal.tier && ["primary", "alternate", "secondary"].includes(signal.tier) ? signal.tier : null;
  const description = (event.sport === "soccer" ? signal.description || signal.reason : signal.reason || signal.description) || "No description supplied.";
  const context = signal.context ?? {};
  const reverseMovement = signal.rule === "mlb_public_bets_underdog_moneyline_move";
  const runLine = signal.rule === "mlb_losing_record_favorable_runline";
  return <div className={`event-signal ${tier ? `event-signal-${tier}` : ""} ${signal.strength === "weak" ? "event-signal-weak" : ""}`}>
    <div className="signal-summary"><Activity size={14} />{tier && <span className={`signal-tier signal-tier-${tier}`}>{readable(tier)}</span>}<strong>{signalRuleLabel(signal)}</strong><span className="predicted-team">{team}{runLine ? " +1.5" : ""}</span>{signal.strength === "weak" && <span className="weak-label">Weak signal</span>}</div>
    <p className="market-caption">{readable(signal.market)} · {readable(signal.prediction)}{signal.strength === "standard" ? " · Standard signal (not a verified win probability)" : ""}</p>
    <p className="signal-explanation">{description}</p>
    {event.sport === "soccer" && <SoccerEvidence signal={signal} event={event} />}
    {reverseMovement && <div className="signal-evidence" aria-label="Public betting and line movement evidence"><strong>Saved signal evidence</strong><Fields fields={[
      ["Public bet side", typeof context.public_bet_side === "string" ? `${context.public_bet_side} / ${predictedTeam(event, context.public_bet_side)}` : context.public_bet_side], ["Public bets", context.public_bet_pct == null ? undefined : `${context.public_bet_pct}%`],
      ["Underdog opening ML", context.underdog_open_ml == null ? undefined : moneyline(Number(context.underdog_open_ml))], ["Underdog current ML", context.underdog_current_ml == null ? undefined : moneyline(Number(context.underdog_current_ml))],
      ["Movement toward", context.underdog_move_toward],
    ]} /></div>}
    {runLine && <div className="signal-evidence" aria-label="Run-line evidence"><strong>Run-line evidence</strong><Fields fields={[
      ["Supported side", `${team} +1.5`], ["Spread odds", context.spread_odds == null ? undefined : moneyline(Number(context.spread_odds))],
      ["Record", context.wins != null && context.losses != null ? `${context.wins}-${context.losses}` : undefined], ["Supporting rules", context.supporting_rules],
    ]} /></div>}
    <details className="signal-dropdown"><summary>Why this signal?<ChevronDown className="dropdown-chevron" size={14} /></summary>
      <Fields fields={[
        ["Rule", signalRuleLabel(signal)], ["Rule key", signal.rule], ["Description", description], ["Predicted side / team", `${signal.predicted_side ?? "—"} / ${team}`],
        ...(tier ? [["Tier", readable(tier)] as [string, JsonValue]] : []), ["Strength", signal.strength],
        ["Market", readable(signal.market)], ["Prediction", readable(signal.prediction)], ["Confidence", signal.confidence],
        ["Observed value", signal.observed_value], ["Configured threshold", signal.threshold],
      ]} />
      <h4>Context</h4>
      {Object.keys(signal.context ?? {}).length ? <Fields fields={Object.entries(signal.context ?? {}).map(([key, value]) => [readable(key), value])} /> : <p className="context-note">No context supplied.</p>}
      {process.env.NODE_ENV !== "production" && <details className="raw-context"><summary>Raw context JSON</summary><pre>{JSON.stringify(signal.context ?? {}, null, 2)}</pre></details>}
    </details>
  </div>;
}


const DRAW_HISTORY_LABELS: Record<string, string> = {
  moved_and_returned: "Moved and returned",
  no_departure_recorded: "No departure recorded",
  history_unavailable: "History unavailable",
};
function object(value: JsonValue | undefined): { [key: string]: JsonValue } | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
function savedPrice(value: JsonValue | undefined) {
  return typeof value === "number" ? moneyline(value) : "—";
}
function SoccerEvidence({ signal, event }: { signal: OddsSignal; event: Pick<OddsEvent, "home_team" | "away_team"> }) {
  const context = signal.context ?? {};
  const history = object(context.draw_history);
  const historyStatus = typeof history?.status === "string" ? history.status : null;
  const qualifying = Array.isArray(context.qualifying_teams) ? context.qualifying_teams : [];
  const movement = typeof context.movement_points === "number";
  if (!history && !movement && !qualifying.length) return null;
  return <div className="signal-evidence" aria-label="Soccer signal evidence">
    {history && <><strong>{historyStatus ? DRAW_HISTORY_LABELS[historyStatus] ?? readable(historyStatus) : "History unavailable"}</strong>
      <p>{historyStatus === "moved_and_returned" ? "An earlier recorded draw price differed from opening before returning." : historyStatus === "no_departure_recorded" ? "No departure appears in the available earlier readings. Movement between readings is unknown." : "Earlier draw movement cannot be established from the available history."}</p>
      <Fields fields={[["Opening draw ML", savedPrice(context.opening_ml)], ["Current draw ML", savedPrice(context.current_ml)], ["Earlier valid readings", history.prior_valid_readings]]} /></>}
    {movement && <><strong>Opening {typeof context.opening_role === "string" ? context.opening_role : "team"} movement</strong>
      <Fields fields={[["Team", typeof context.team === "string" ? context.team : predictedTeam(event, signal.predicted_side)], ["Opening ML", savedPrice(context.opening_ml)], ["Current ML", savedPrice(context.current_ml)], ["Movement", `${context.movement_points} points · ${typeof context.movement_direction === "string" ? readable(context.movement_direction) : "Direction unavailable"}`]]} />
      {context.movement_method === "continuous_american_points" && <p>Movement excludes the ±100 jump at even money. Team roles are fixed at opening.</p>}</>}
    {qualifying.length > 0 && <><strong>Qualifying team prices · match total</strong><Fields fields={qualifying.flatMap((value) => {
      const quote = object(value);
      return quote && typeof quote.side === "string" ? [[predictedTeam(event, quote.side), savedPrice(quote.current_ml)] as [string, JsonValue]] : [];
    })} /></>}
    {typeof context.sportsbook_name === "string" && <p>Sportsbook: {context.sportsbook_name}</p>}
  </div>;
}
