import { TriangleAlert } from "lucide-react";
import { availabilityHeld, numberLabel, quoteAge, type ReceivingCard } from "../../lib/nfl-receiving";

const label = (value: string) => value.replaceAll("_", " ");
const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Unavailable";

export function NFLInjuryContext({ card, now, outdated, locked }: { card: ReceivingCard; now: number; outdated: boolean; locked: boolean }) {
  const availability = card.late_availability_notice ?? card.availability;
  const subject = availability?.players?.find(player => player.relationship === "subject");
  const held = availabilityHeld(availability);
  const contributors = card.injury_opportunity?.contributors?.slice(0, 2) ?? [];
  return <>
    {availability && <aside className={`nfl-injury-notice ${held ? "nfl-injury-hold" : ""}`} aria-label="Player injury status">
      <div className="nfl-injury-title"><TriangleAlert size={16} aria-hidden="true" /><strong>{card.late_availability_notice ? "Late injury update" : "Player availability"} · {label(availability.status)}{subject?.injury ? ` · ${subject.injury}` : ""}</strong></div>
      {held && <p>{locked ? "Current availability is on hold. The official prediction remains frozen." : "Signal on hold · Player availability must clear before a current signal can be shown."}</p>}
      {["questionable", "probable"].includes(availability.status) && <p>Projection assumes the player’s usual workload if they play; participation and workload remain uncertain.</p>}
      {availability.status === "not_listed" && <p>Not listed in the report does not mean confirmed healthy or active.</p>}
      <p>{outdated ? "Saved report · Refresh failed" : `${label(availability.freshness ?? "missing")} report`} · {quoteAge(availability.observed_at, now)}</p>
      {card.late_availability_notice && <p>This update is separate from the immutable official prediction.</p>}
      <details><summary>Injury report details</summary><p>Observed: {time(availability.observed_at)}<br />Reported: {time(subject?.reported_at)}<br />Source: {availability.source || "Unavailable"}</p></details>
    </aside>}
    {contributors.length > 0 && <aside className="nfl-injury-opportunity" aria-label="Teammate injury opportunity">
      <h4>{locked || outdated ? "Latest saved teammate injury context" : "Teammate injury opportunity"}</h4>
      <p>Context only · No numerical injury adjustment or OVER recommendation.{locked ? " Separate from the frozen official prediction." : ""}</p>
      {contributors.map((item, index) => <div key={`${item.code}-${item.related_player_id}-${index}`}>
        <p><strong>{label(item.status)} · </strong>{item.explanation}</p>
        <details><summary>Supporting usage and injury evidence</summary>
          <p>Role: {label(item.role)} · Inferred from recent usage, not a confirmed starter or depth chart.<br />Role source: {label(item.role_source)}<br />Usage captured: {time(card.injury_opportunity?.observed_at)}<br />Injury observed: {time(item.injury_observed_at)} · {outdated ? "Saved" : label(item.freshness)}<br />Reported: {time(item.reported_at)}</p>
          <p>Leader usage: {numberLabel(item.sample.leader_usage)} ({numberLabel(item.sample.leader_share == null ? null : Number(item.sample.leader_share) * 100)}% of recorded usage). Player usage: {numberLabel(item.sample.beneficiary_usage)} across {item.sample.beneficiary_games} games ({numberLabel(item.sample.beneficiary_share == null ? null : Number(item.sample.beneficiary_share) * 100)}%).</p>
          <p>{item.sample.game_ids.length} sampled team games · {item.sample.games_without_recorded_leader_usage.length} without recorded leader workload. Missing workload does not prove absence.</p>
          <ul>{item.sample.records.map((row, i) => <li key={i}>{row.name} · {time(row.kickoff)} · {numberLabel(row.value)} {row.metric}<small>Game {row.game_id} · Finalized {time(row.finalized_at)}</small></li>)}</ul>
        </details>
      </div>)}
    </aside>}
  </>;
}
