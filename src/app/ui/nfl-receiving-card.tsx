"use client";

import { useId, useState } from "react";
import { NFL_BOOKS, PROP_LABELS, numberLabel, marketIsCurrent, deadlineIsCurrent, consensusIsCurrent, selectPastProp, displayBookSide, quoteAge, type Numeric, type DisplayQuote, type ReceivingCard } from "../../lib/nfl-receiving";

function percent(value: Numeric | undefined) {
  return value == null || value === "" || !Number.isFinite(Number(value)) ? "—" : `${numberLabel(Number(value) * 100)}%`;
}

function BookSide({ quote, now }: { quote: DisplayQuote; now: number }) {
  if (quote.status === "missing") return <span className="receiving-book-status">No line recorded</span>;
  if (quote.status === "withdrawn") return <span className="receiving-book-status">Unavailable</span>;
  if (quote.status === "invalid_timestamp") return <span className="receiving-book-status">Timing unavailable</span>;
  const providerOld = quote.staleReasons.includes("provider_update_old") || Boolean(quote.providerUpdatedAt && quote.observedAt && Date.parse(quote.providerUpdatedAt) < Date.parse(quote.observedAt));
  const title = [quote.observedAt ? `Last collected: ${quote.observedAt}` : "Collection time unavailable",
    quote.providerUpdatedAt ? `Provider updated: ${quote.providerUpdatedAt}` : "",
    quote.staleReasons.includes("collection_overdue") ? "Collection is overdue" : ""].filter(Boolean).join(" · ");
  return <div className={`receiving-quote receiving-quote-${quote.status}`} title={title}>
    <strong>{numberLabel(quote.line)}</strong><span className="receiving-quote-odds">{numberLabel(quote.odds, true)}</span>
    <small>{quote.status === "fresh" ? "Current" : `Last saved · ${quoteAge(quote.observedAt, now)}`}</small>
    {quote.status === "stale" && providerOld && <small>Provider update: {quoteAge(quote.providerUpdatedAt, now)}</small>}
  </div>;
}

export function NFLReceivingCard({ card, matchup, now, sample = false, outdated = false }: {
  card: ReceivingCard; matchup?: string; now: number; sample?: boolean; outdated?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const historyId = useId();
  const marketReady = !outdated && (sample || marketIsCurrent(card, now));
  const books = marketReady ? NFL_BOOKS.flatMap(id => {
    const book = card.market.books.find(book => book.id === id);
    return book?.line != null && (sample || deadlineIsCurrent(book.expires_at, now)) ? [book] : [];
  }) : [];
  const consensusReady = marketReady && (sample ? card.market.books_available >= 2 : consensusIsCurrent(card, now));
  const official = card.official_prediction;
  const locked = Boolean(official || card.display?.state === "locked" || card.display?.state === "closed" || (card.lock_at && Date.parse(card.lock_at) <= now));
  const signal = locked ? official?.signal : card.live_signal ?? card.signal;
  const directional = signal?.status === "eligible" && (signal.direction === "OVER" || signal.direction === "UNDER") && signal.threshold != null;
  const showSignal = directional && (locked ? Boolean(official) : consensusReady && (!card.display || card.display.state === "signal"));
  const reasonCodes = new Set(signal?.reasons.map(reason => reason.code));
  const fallbackStatus = reasonCodes.has("insufficient_history") || reasonCodes.has("insufficient_season_history") ? "More history needed"
    : reasonCodes.has("insufficient_fresh_main_books") ? "More sportsbook coverage needed" : null;
  let status = card.display?.label || fallbackStatus || (signal?.status === "eligible" && signal.direction === "PASS" ? "No qualifying edge" : "Signal unavailable");
  if (locked) status = official ? (directional ? "Prediction locked" : "No directional official prediction") : "Prediction window closed";
  else if (outdated) status = "Current comparison awaiting refresh";
  else if (!books.length && (!card.display || ["signal", "no_edge", "awaiting_odds", "limited_coverage"].includes(card.display.state))) status = "No fresh odds available";
  else if (!consensusReady && ["signal", "no_edge"].includes(card.display?.state ?? "signal")) status = "Current comparison awaiting refresh";
  const freshComparison = consensusReady && card.market.median_line != null;
  const savedComparison = !freshComparison ? card.market.saved_comparison : null;
  const currentEligible = !locked && !outdated && consensusReady && signal?.status === "eligible";
  const recorded = !locked && !currentEligible ? card.last_recorded_signal : null;
  const projection = locked ? official?.signal.projection : card.available ? card.projection.final : null;
  const reasons = showSignal ? [...new Set(signal.reasons.map(reason => reason.text).filter(Boolean))].slice(0, 3) : [];
  const sampleSize = signal?.data_quality?.sample_size;
  if (showSignal && reasons.length < 3 && sampleSize != null) reasons.push(`Based on ${sampleSize} recent recorded games.`);
  const games = card.recent_games?.games.slice(0, 10) ?? [];
  const visibleGames = expanded ? games : games.slice(0, 5);
  const unit = card.prop === "receiving_yards" ? "yds" : "rec";
  const history = card.history[card.prop === "receiving_yards" ? "yards" : "receptions"];
  const sampleLabel = card.recent_games?.scope === "last_10_regular_and_postseason" ? "Recorded sample · up to 10 games" : "Recorded sample";
  const trend = card.opportunity.trend;
  const opportunity = card.opportunity.windows?.season;
  const hasPastProps = games.some(game => selectPastProp(game.props));
  const hasTargets = !hasPastProps && games.some(game => game.targets != null);
  const leadSignal = recorded?.signal ?? (showSignal ? signal : null);
  const historyReason = leadSignal?.reasons.find(reason => reason.code === "historical_threshold");
  const comparisonEdge = freshComparison ? card.edge_vs_median : savedComparison?.edge_vs_median;
  const comparisonLine = freshComparison ? card.market.median_line : savedComparison?.median_line;
  const comparisonPercent = comparisonEdge != null && comparisonLine != null && Number(comparisonLine) !== 0
    ? Number(comparisonEdge) / Math.abs(Number(comparisonLine)) * 100 : null;


  return <article className="receiving-card">
    <header className="receiving-card-heading"><div>
      <div className="eyebrow">{PROP_LABELS[card.prop]}</div>
      <h3>{card.player.name}</h3>
      {matchup && <p className="receiving-matchup">{matchup}</p>}
    </div>{showSignal && <span className="receiving-direction">{signal.direction} {numberLabel(signal.threshold)}</span>}{recorded && <span className="receiving-recorded-badge">{recorded.signal.direction}{recorded.signal.direction !== "PASS" && <> {numberLabel(recorded.signal.threshold)}</>}<small>Last recorded</small></span>}</header>
    <div className="receiving-current">
      {showSignal ? <p className="receiving-caption">{locked ? "Official · Locked" : "Current signal"}{signal.threshold_is_offered === false ? " · Consensus, not an offered line" : ""}</p> : <p className="receiving-status">{status}</p>}
      {locked && projection != null && <p className="receiving-estimate">Official projection: {numberLabel(projection)} {unit} · Frozen difference: {numberLabel(signal?.edge, true)}</p>}
      {recorded && <aside className="receiving-recorded receiving-recorded-lead" aria-label="Historical recorded signal">
        <h4>Last recorded signal · {new Date(recorded.recorded_at).toLocaleString()}</h4>
        <p>{recorded.signal.direction} · Original threshold: {numberLabel(recorded.signal.threshold)} · Original projection: {numberLabel(recorded.signal.projection)} {unit}</p>
        <p>Original difference: {numberLabel(recorded.signal.edge, true)} {unit}{recorded.signal.edge_pct != null && <> · {numberLabel(recorded.signal.edge_pct, true)}%</>}</p>
        <small>Historical · Not current or official · Model {recorded.version}</small>
        <div className="receiving-reasons"><h4>Evidence at recording time</h4><ul>{recorded.signal.reasons.map((reason, index) => <li key={index}>{reason.text}</li>)}</ul></div>
        <details><summary>Recorded comparison details</summary><p>Evidence score at recording: {numberLabel(recorded.signal.confidence)}/100 · Not a win probability</p><ul>{Object.entries(recorded.main_lines).map(([book, line]) => <li key={book}>{card.market.books.find(current => current.id === book)?.name ?? book}: {numberLabel(line)}</li>)}</ul></details>
      </aside>}
      {recorded && <p className="receiving-caption">Latest research comparison · May differ from the recorded signal above</p>}
      <div className="receiving-comparison" aria-label="Current projection and consensus">
        <div><span>{locked ? outdated ? "Saved research projection" : "Live projection" : outdated ? "Saved projection" : "Projection"}</span><strong>{numberLabel(savedComparison ? savedComparison.projection : card.available ? card.projection.final : null)} <small>{unit}</small></strong></div>
        <div><span>{savedComparison ? "Last saved consensus" : "Current consensus"}</span><strong>{numberLabel(freshComparison ? card.market.median_line : savedComparison?.median_line)}</strong></div>
        <div><span>{savedComparison ? "Difference vs saved line" : "Difference"}</span><strong>{numberLabel(comparisonEdge, true)}</strong>{comparisonPercent != null && <small className="receiving-book-status">{numberLabel(comparisonPercent, true)}% vs line</small>}</div>
      </div>
      {savedComparison && <details className="receiving-saved-context">
        <summary>Saved quotes · {quoteAge(savedComparison.oldest_observed_at, now)} · {savedComparison.books_available} books</summary>
        <p>Latest saved lines compared with the displayed projection. Not a live signal or a frozen prediction.</p>
        <p>Projection evidence: {savedComparison.projection_observed_at ? new Date(savedComparison.projection_observed_at).toLocaleString() : "Unavailable"}</p>
        <ul>{savedComparison.books.map(book => <li key={book.bookmaker}>{card.market.books.find(current => current.id === book.bookmaker)?.name ?? book.bookmaker}: {numberLabel(book.line)} · {quoteAge(book.last_seen_at, now)}<span className="receiving-book-status">{book.last_seen_at ? new Date(book.last_seen_at).toLocaleString() : "Observation time unavailable"}</span></li>)}</ul>
      </details>}
      {showSignal && reasons.length > 0 && <div className="receiving-reasons"><h4>{locked ? "Why this official signal" : "Why this signal"}</h4><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
    </div>
    <section className="receiving-evidence" aria-label="Research evidence">
      <h4>Research evidence</h4>
      <dl className="receiving-components">
        <div><dt>Last 5 / last 3 average</dt><dd>{numberLabel(history?.last_5?.available === false ? null : history?.last_5?.mean)} / {numberLabel(history?.last_3?.available === false ? null : history?.last_3?.mean)} {unit}</dd></div>
        <div><dt>Targets per game · sample → last 3</dt><dd>{numberLabel(trend?.season)} → {numberLabel(trend?.last_3)}</dd></div>
        {opportunity?.target_share?.available && <div><dt>Target share · recorded sample</dt><dd>{percent(opportunity.target_share.value)}</dd></div>}
        {opportunity?.catch_rate?.available && <div><dt>Catch rate · recorded sample</dt><dd>{percent(opportunity.catch_rate.value)}</dd></div>}
        {card.prop === "receiving_yards" && opportunity?.yards_per_target?.available && <div><dt>Yards per target · recorded sample</dt><dd>{numberLabel(opportunity.yards_per_target.value)}</dd></div>}
      </dl>
      <p className="receiving-caption">{sampleLabel} · {history?.season?.games_available ?? "—"} observations. Recent averages describe production; the projection uses weighted medians.</p>
      {historyReason ? <p className="receiving-caption">{recorded ? "At recording time" : locked ? "At official lock" : "At the signal threshold"}: {historyReason.text}</p> : <p className="receiving-caption">Historical threshold comparison unavailable.</p>}
    </section>
    <section className="receiving-current-prices" aria-label="Sportsbook comparison">
      <h4>Sportsbook odds <span>· {books.length}/3 current lines</span></h4>
      <table className="receiving-books receiving-saved-books"><caption className="sr-only">Sportsbook main lines and American odds. Each side has its own threshold. Last saved prices are not current.</caption><thead><tr><th scope="col">Sportsbook</th><th scope="col">Over<br />line / odds</th><th scope="col">Under<br />line / odds</th><th scope="col">Difference</th></tr></thead><tbody>{NFL_BOOKS.map(id => {
        const book = card.market.books.find(book => book.id === id);
        const over = displayBookSide(book, "over", now, outdated, sample);
        const under = displayBookSide(book, "under", now, outdated, sample);
        const liveEdge = books.some(book => book.id === id) && over.status === "fresh" && over.line === book?.line;
        const savedEdge = !liveEdge && (over.status === "fresh" || over.status === "stale") && over.line != null && over.line === book?.latest_saved?.over?.line ? book.saved_edge : null;
        const name = book?.name ?? { draftkings: "DraftKings", fanduel: "FanDuel", bovada: "Bovada" }[id];
        return <tr key={id}><th scope="row">{name}</th><td><BookSide quote={over} now={now} /></td><td><BookSide quote={under} now={now} /></td><td>{numberLabel(liveEdge ? book?.edge : savedEdge, true)}{(liveEdge ? book?.edge != null : savedEdge != null) && <small className="receiving-book-status">{liveEdge ? "Live diff." : "Saved diff."}</small>}</td></tr>;
      })}</tbody></table>
      <p className="receiving-caption">Each side uses its own line. Differences compare the displayed projection with that book’s OVER line. Saved differences are not live signals.</p>
    </section>
    <section aria-label="Recent performances" className="receiving-recent">
      <h4>Recent performances</h4>
      {games.length ? <>
        <table id={historyId} className={`receiving-history ${!hasPastProps ? "receiving-history-production" : ""}`}>
          <caption className="sr-only">{card.player.name}: {PROP_LABELS[card.prop]} and recorded past props</caption>
          <thead><tr><th scope="col">Game</th><th scope="col">{unit === "yds" ? "Yards" : "Rec."}</th>{hasPastProps && <><th scope="col">Past prop</th><th scope="col">Result</th></>}{hasTargets && <th scope="col">Targets</th>}</tr></thead>
          <tbody>{visibleGames.map((game, index) => {
            const past = selectPastProp(game.props);
            return <tr key={`${game.game_id ?? game.kickoff}-${index}`}>
              <th scope="row"><time dateTime={game.kickoff}>{new Date(game.kickoff).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time><span>{game.home_away === "away" ? "at " : game.home_away === "home" ? "vs " : ""}{game.opponent || "Opponent unavailable"}</span>{game.season_type === 3 && <small className="receiving-playoff">Playoffs{game.season != null ? ` · ${game.season}` : ""}</small>}</th>
              <td>{numberLabel(game.value)}</td>
              {hasPastProps && <td>{past ? <>{numberLabel(past.line)}<small>{past.bookmaker_name}</small></> : "—"}</td>}
              {hasPastProps && <td><span className="receiving-result">{game.value != null && past?.line != null ? past.result ?? "—" : "—"}</span></td>}{hasTargets && <td>{numberLabel(game.targets)}</td>}
            </tr>;
          })}</tbody>
        </table>
        {games.length > 5 && <button className="receiving-show-games" aria-expanded={expanded} aria-controls={historyId} onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer games" : `Show all ${games.length} games`}</button>}
        <p className="receiving-caption">{hasPastProps ? "Past props use recorded pregame lines. — means unavailable." : "No historical sportsbook lines recorded for these games."}</p>
      </> : <p className="receiving-caption">Recent performances are not available yet.</p>}
    </section>
    {card.available && <details className="receiving-details">
      <summary>Projection details</summary>
      {locked && <p className="receiving-caption">Current research calculations, separate from the frozen official prediction.</p>}
      <dl className="receiving-components">
        {Object.entries(card.projection.components ?? {}).map(([window, component]) => <div key={window}><dt>{window === "season" ? sampleLabel : window === "last_5" ? "Last 5 games" : window === "last_3" ? "Last 3 games" : window} median · {component.games} games</dt><dd>{numberLabel(component.value)} × {percent(component.effective_weight)}{!component.used && " · Not used"}</dd></div>)}
        <div><dt>Weighted baseline</dt><dd>{numberLabel(card.projection.baseline)}</dd></div>
        <div><dt>Opportunity adjustment</dt><dd>{numberLabel(card.projection.opportunity_adjustment, true)}</dd></div>
        <div><dt>Opponent adjustment</dt><dd>{numberLabel(card.projection.opponent_adjustment, true)}</dd></div>
        {card.projection.floor_adjustment != null && Number(card.projection.floor_adjustment) !== 0 && <div><dt>Zero-floor adjustment</dt><dd>{numberLabel(card.projection.floor_adjustment, true)}</dd></div>}
        <div><dt>Final projection</dt><dd>{numberLabel(card.projection.final)} {unit}</dd></div>
        <div><dt>Recorded production median</dt><dd>{numberLabel(history?.season?.median)} {unit}</dd></div>
        <div><dt>Production standard deviation</dt><dd>{numberLabel(card.volatility.stddev)} {unit}</dd></div>
        {freshComparison && <div><dt>Current sportsbook line range</dt><dd>{numberLabel(card.market.line_range)} {unit}</dd></div>}
      </dl>
      {card.input_observed_at && <p className="receiving-caption">Evidence observed: {new Date(card.input_observed_at).toLocaleString()}</p>}
      {showSignal && <p className="receiving-caption">{locked ? "Official" : "Current"} evidence score: {numberLabel(signal.confidence)}/100 · Not a win probability</p>}
    </details>}
    {(card.data_gaps?.length > 0 || signal?.status === "unavailable") && <details className="receiving-details"><summary>Data availability</summary><ul>{signal?.status === "unavailable" && signal.reasons.map((reason, index) => <li key={`reason-${index}`}>{reason.text}</li>)}{card.data_gaps?.map(gap => <li key={gap}>{gap}</li>)}</ul></details>}
  </article>;
}
