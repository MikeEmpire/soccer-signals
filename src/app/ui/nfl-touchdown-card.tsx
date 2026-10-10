"use client";

import { useId, useState } from "react";
import { availabilityHeld, NFL_BOOKS, numberLabel, quoteAge, type ReceivingCard, type ReceivingSignal } from "../../lib/nfl-receiving";
import { displayTDSide, impliedProbability, pointsLabel, probabilityLabel, tdComparison, tdSignalIsCurrent, type TDSide } from "../../lib/nfl-touchdown";
import { NFLInjuryContext } from "./nfl-injury-context";

function SignalEvidence({ signal }: { signal: ReceivingSignal }) {
  return <><p>Scoring estimate: {probabilityLabel(signal.projection)} · {signal.comparison_side?.toUpperCase() ?? signal.direction} implied: {probabilityLabel(signal.implied_probability)} · Difference: {pointsLabel(signal.edge)}</p>
    <p className="receiving-caption">Sample coverage: {numberLabel(signal.confidence)}/100 · Not win probability or predictive accuracy</p>
    <ul>{signal.reasons.map((reason, i) => <li key={i}>{reason.text}</li>)}</ul></>;
}
export function NFLTouchdownCard({ card, matchup, now, sample = false, outdated = false }: {
  card: ReceivingCard; matchup?: string; now: number; sample?: boolean; outdated?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const historyId = useId();
  const official = card.official_prediction;
  const locked = Boolean(official || ['locked', 'closed'].includes(card.display?.state ?? '') || (card.lock_at && Date.parse(card.lock_at) <= now));
  const signal = locked ? official?.signal : card.live_signal ?? card.signal;
  const held = availabilityHeld(card.availability);
  const current = !locked && !held && tdSignalIsCurrent(card, signal, now, outdated, sample);
  const showSignal = signal?.status === 'eligible' && ['YES', 'NO'].includes(signal.direction)
    && (locked ? Boolean(official) : current && (!card.display || card.display.state === 'signal'));
  const recorded = !locked && !current ? card.last_recorded_signal : null;
  const conditional = !(card.available && card.projection.final != null) && card.projection.conditional_on_playing != null;
  const raw = conditional ? card.projection.conditional_on_playing : card.available ? card.projection.final : null;
  const estimate = raw == null ? null : Number(raw);
  const games = card.recent_games?.games.slice(0, 10) ?? [];
  const status = locked ? official ? 'Official · Locked' : 'Prediction window closed'
    : held ? 'Signal on hold · Player availability' : outdated ? 'Current comparison awaiting refresh'
    : current ? card.display?.label ?? 'No qualifying edge' : card.display?.state !== 'signal' ? card.display?.label ?? 'Current signal unavailable' : 'Current signal unavailable';
  return <article className="receiving-card">
    <header className="receiving-card-heading"><div><div className="eyebrow">Anytime TD</div><h3>{card.player.name}</h3>{matchup && <p className="receiving-matchup">{matchup}</p>}</div>
      {showSignal && <span className="receiving-direction">{signal.direction}</span>}
      {recorded && <span className="receiving-recorded-badge">{recorded.signal.direction}<small>Last recorded</small></span>}
    </header>
    <NFLInjuryContext card={card} now={now} outdated={outdated} locked={locked} />
    <p className="receiving-status">{showSignal && !locked ? 'Current signal' : status}</p>
    {!showSignal && card.display?.description && <p className="receiving-caption">{card.display.description}</p>}
    {locked && official && <aside className="receiving-recorded"><h4>Frozen official prediction · {official.signal.direction}</h4><SignalEvidence signal={official.signal} /></aside>}
    {recorded && <aside className="receiving-recorded" aria-label="Historical recorded signal"><h4>Last recorded signal · {recorded.signal.direction}</h4><p>{new Date(recorded.recorded_at).toLocaleString()} · Historical, not current or official</p><SignalEvidence signal={recorded.signal} /></aside>}
    <div className="receiving-comparison td-estimate"><div><span>{outdated ? 'Saved scoring estimate' : locked ? 'Latest research scoring estimate' : 'Scoring estimate'}{conditional && ' · If playing'}</span><strong>{probabilityLabel(estimate)}</strong></div></div>
    <p className="receiving-caption">Uncalibrated scoring frequency, conditional on participation. This is not a validated win probability.</p>
    {conditional && <p className="receiving-caption">Estimate and differences assume the player plays. Participation is unconfirmed; injury reports are collected within 24 hours of kickoff. These comparisons do not clear the availability hold.</p>}
    <section className="receiving-current-prices" aria-label="Touchdown probability comparisons"><h4>Offered price comparisons</h4>
      {(['yes', 'no'] as const).map(side => {
        const comparison = tdComparison(card, side, now, outdated, sample);
        const sideEstimate = estimate == null ? null : side === 'yes' ? estimate : 1 - estimate;
        const edge = sideEstimate != null && comparison.probability != null ? sideEstimate - comparison.probability : null;
        return <div key={side} className="receiving-comparison"><div><span>{side.toUpperCase()} estimate{conditional && ' · If playing'}</span><strong>{probabilityLabel(sideEstimate)}</strong></div>
          <div><span>{comparison.current ? 'Current' : 'Saved'} implied · {side.toUpperCase()}</span><strong>{probabilityLabel(comparison.probability)}</strong></div>
          <div><span>Difference{conditional && ' · If playing'}</span><strong>{pointsLabel(edge)}</strong></div></div>;
      })}
      <p className="receiving-caption">Implied prices include bookmaker margin. Each side needs two offered book prices for a comparison. NO estimates are the model complement; missing NO prices stay unavailable. Differences are percentage points (pp).</p>
      <table className="receiving-books td-books"><caption className="sr-only">Offered YES and NO prices, implied percentages and model differences</caption><thead><tr><th scope="col">Sportsbook</th><th scope="col">YES</th><th scope="col">NO</th></tr></thead>
        <tbody>{NFL_BOOKS.map(id => { const book = card.market.books.find(b => b.id === id); return <tr key={id}><th scope="row">{book?.name ?? { draftkings: 'DraftKings', fanduel: 'FanDuel', bovada: 'Bovada' }[id]}</th>{(['yes', 'no'] as TDSide[]).map(side => {
          const quote = displayTDSide(book, side, now, outdated, sample);
          const implied = impliedProbability(quote.odds);
          const sideEstimate = estimate == null ? null : side === 'yes' ? estimate : 1 - estimate;
          return <td key={side}>{implied == null ? <span className="receiving-book-status">{quote.status === 'withdrawn' ? 'Withdrawn' : quote.status === 'invalid_timestamp' ? 'Timing unavailable' : 'Not offered'}</span> : <>
            <strong>{numberLabel(quote.odds, true)}</strong><small>{probabilityLabel(implied)} implied</small>
            <small>{sideEstimate == null ? '—' : pointsLabel(sideEstimate - implied)} diff.{conditional && ' · If playing'}</small>
            <small>{quote.status === 'fresh' ? 'Current' : 'Last saved'} · {quoteAge(quote.observedAt, now)}</small></>}</td>;
        })}</tr>; })}</tbody></table>
    </section>
    {showSignal && !locked && <details className="receiving-details"><summary>Signal evidence</summary><SignalEvidence signal={signal} /></details>}
    <section className="receiving-recent" aria-label="Recent scoring outcomes"><h4>Recent scoring outcomes</h4>
      {games.length ? <><table id={historyId} className="receiving-history td-history"><thead><tr><th scope="col">Game</th><th scope="col">Scored</th><th scope="col">TDs</th><th scope="col">Past result</th></tr></thead>
        <tbody>{(expanded ? games : games.slice(0, 5)).map((game, i) => {
          const past = NFL_BOOKS.map(book => game.props.find(prop => prop.bookmaker === book && prop.result != null)).find(Boolean);
          return <tr key={`${game.game_id}-${i}`}><th scope="row"><time dateTime={game.kickoff}>{new Date(game.kickoff).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time><span>{game.home_away === 'away' ? 'at ' : game.home_away === 'home' ? 'vs ' : ''}{game.opponent ?? 'Opponent unavailable'}</span></th>
            <td>{game.value == null ? 'Unresolved' : Number(game.value) === 1 ? 'YES' : 'NO'}</td><td>{game.touchdowns != null ? numberLabel(game.touchdowns) : game.recorded_touchdowns != null && Number(game.recorded_touchdowns) > 0 ? `${numberLabel(game.recorded_touchdowns)}+ TDs` : '—'}</td><td>{past?.result ?? '—'}{past && <small>{past.bookmaker_name}</small>}</td></tr>;
        })}</tbody></table>{games.length > 5 && <button className="receiving-show-games" aria-expanded={expanded} aria-controls={historyId} onClick={() => setExpanded(v => !v)}>{expanded ? 'Show fewer games' : `Show all ${games.length} games`}</button>}</> : <p className="receiving-caption">Recent scoring outcomes are not available yet.</p>}
      <p className="receiving-caption">{games.some(game => game.touchdowns == null && Number(game.recorded_touchdowns) > 0) && "A + marks a verified recorded count that may be incomplete. "}Unresolved outcomes stay unknown. Passing touchdowns and two-point conversions do not count as scorer touchdowns.</p>
    </section>
    <details className="receiving-details"><summary>Model and data availability</summary><p>Beta(1,1) estimate: (scoring games + 1) / (resolved games + 2). At least five games and complete captured outcomes are required.</p>
      <p>{numberLabel(card.projection.scoring_games)} scoring games · {numberLabel(card.projection.sample_size)} resolved games</p>
      {card.input_observed_at && <p>Evidence observed: {new Date(card.input_observed_at).toLocaleString()}</p>}
      <ul>{signal?.reasons.map((reason, i) => <li key={i}>{reason.text}</li>)}{card.data_gaps?.map((gap, i) => <li key={`gap-${i}`}>{gap}</li>)}</ul>
    </details>
  </article>;
}
