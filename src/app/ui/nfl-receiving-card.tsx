import { NFL_BOOKS, PROP_LABELS, numberLabel, marketIsCurrent, type ReceivingCard } from "../../lib/nfl-receiving";

export function NFLReceivingCard({ card, now, sample = false, outdated = false }: {
  card: ReceivingCard; now: number; sample?: boolean; outdated?: boolean;
}) {
  const marketReady = sample || (!outdated && marketIsCurrent(card, now));
  const count = marketReady ? card.market.books_available : 0;
  const stats = card.history[card.prop === "receiving_yards" ? "yards" : "receptions"];
  const unit = card.prop === "receiving_yards" ? "yds" : "rec";
  const missing = card.reason === "no_pre_kickoff_input_capture"
    ? "Waiting for pregame research data." : "More receiving history is needed for a projection.";
  return <article className="receiving-card">
    <div className="receiving-card-heading"><div><div className="eyebrow">{PROP_LABELS[card.prop]}</div><h3>{card.player.name}</h3></div>
      <span className="receiving-coverage">{count}/3 books</span></div>
    <div className="receiving-projection"><div><span>Model projection</span><strong>{card.available ? numberLabel(card.projection.final) : "—"} <small>{unit}</small></strong></div>
      <div><span>{count >= 2 ? `${count}-book median` : "Market median"}</span><strong>{marketReady && count >= 2 ? numberLabel(card.market.median_line) : "—"}</strong></div>
      <div><span>Difference</span><strong>{marketReady && count >= 2 ? numberLabel(card.edge_vs_median, true) : "—"}</strong></div></div>
    {!card.available && <p className="receiving-note">{missing}</p>}
    {card.available && <p className="receiving-caption">{stats?.season?.games_available ?? 0} observed games · Projection minus market line, in {unit}</p>}
    <div className="receiving-table-scroll"><table className="receiving-books"><caption className="sr-only">Sportsbook lines and prices for {card.player.name}, {PROP_LABELS[card.prop]}</caption>
      <thead><tr><th>Sportsbook</th><th>Line</th><th>Over</th><th>Under</th><th>Diff.</th></tr></thead><tbody>
      {NFL_BOOKS.map(id => { const book = card.market.books.find(b => b.id === id); return <tr key={id}><th>{book?.name ?? ({ draftkings: "DraftKings", fanduel: "FanDuel", bovada: "Bovada" })[id]}</th>
        <td>{marketReady ? numberLabel(book?.line) : "—"}</td><td>{marketReady ? numberLabel(book?.over_odds, true) : "—"}</td><td>{marketReady ? numberLabel(book?.under_odds, true) : "—"}</td><td>{marketReady ? numberLabel(book?.edge, true) : "—"}</td></tr>; })}
      </tbody></table></div>
    {count < 2 && <p className="receiving-note">{count === 1 ? "One book available. Multi-book consensus and disagreement are unavailable." : "No fresh book lines available. Market comparisons will appear after the next data update."}</p>}
    {card.available && <details className="receiving-details"><summary>How this projection was built</summary>
      <dl className="receiving-components"><div><dt>Weighted baseline</dt><dd>{numberLabel(card.projection.baseline)}</dd></div><div><dt>Target-volume adjustment</dt><dd>{numberLabel(card.projection.opportunity_adjustment, true)}</dd></div><div><dt>Opponent adjustment</dt><dd>{numberLabel(card.projection.opponent_adjustment, true)}</dd></div></dl>
      <p className="receiving-caption">Eligible medians start at 40% season, 35% last five, 25% last three. Incomplete windows are excluded and weights renormalized.</p>
      <div className="receiving-table-scroll"><table className="receiving-books"><caption>Pregame history</caption><thead><tr><th>Window</th><th>Games</th><th>Mean</th><th>Median</th></tr></thead><tbody>
        {([['season', 'Season'], ['last_8', 'Last 8'], ['last_5', 'Last 5'], ['last_3', 'Last 3']] as const).map(([key, name]) => <tr key={key}><th>{name}</th><td>{stats?.[key]?.games_available ?? 0}</td><td>{numberLabel(stats?.[key]?.mean)}</td><td>{numberLabel(stats?.[key]?.median)}</td></tr>)}
      </tbody></table></div>
      <dl className="receiving-components"><div><dt>Season targets / game</dt><dd>{numberLabel(card.opportunity.trend?.season)}</dd></div><div><dt>Last 3 targets / game</dt><dd>{numberLabel(card.opportunity.trend?.last_3)}</dd></div><div><dt>Target trend vs season</dt><dd>{numberLabel(card.opportunity.trend?.delta_last_3_vs_season, true)}</dd></div><div><dt>Production standard deviation</dt><dd>{numberLabel(card.volatility.stddev)}</dd></div><div><dt>Book line range</dt><dd>{marketReady && count >= 2 ? numberLabel(card.market.line_range) : "—"}</dd></div></dl>
      {card.input_observed_at && <p className="receiving-caption">Inputs saved {new Date(card.input_observed_at).toLocaleString()}. Later results are excluded.</p>}
      <p className="receiving-caption">Opportunity adjustment capped at 15% of baseline; opponent adjustment at 10%. Missing context adds zero. These estimates have not yet been calibrated.</p>
    </details>}
  </article>;
}
