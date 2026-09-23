import { ChevronDown, Info } from "lucide-react";
import { moneyline, readable } from "../../lib/odds";
import {
  formatUTCDateTime,
  formatUTCTime,
  OUTCOME_LABELS,
  signalDisplayLabel,
  type GameFavorite,
  type GameReview,
  type GameTeam,
  type RetrospectiveAnalysis,
  type RetrospectiveSignal,
  type ReviewObservation,
  type ReviewSignal,
} from "../../lib/odds-review";

// ─── Outcome badge ────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
  const label = OUTCOME_LABELS[outcome] ?? readable(outcome);
  const cls =
    outcome === "win" ? "outcome-hit" :
    outcome === "loss" ? "outcome-miss" :
    outcome === "push" ? "outcome-push" :
    outcome === "pending" ? "outcome-pending" :
    outcome === "ungradable" ? "outcome-ungradable" :
    "outcome-unknown";
  return <span className={`outcome-badge ${cls}`}>{label}</span>;
}

// ─── Individual recorded signal row ──────────────────────────────────────────

function ReviewSignalRow({ signal }: { signal: ReviewSignal }) {
  const label = signalDisplayLabel(signal);
  const teamName = signal.selected_team?.name || null;
  const side = teamName ?? (signal.predicted_side ? readable(signal.predicted_side) : null);
  const text = signal.description || signal.reason || null;

  return (
    <div className="review-signal-row">
      <div className="review-signal-top">
        <strong className="review-signal-label">{label}</strong>
        <OutcomeBadge outcome={signal.outcome} />
      </div>
      {side && (
        <div className="review-signal-meta">
          <span>{side}</span>
          <span className="review-signal-sep">·</span>
          <span>{readable(signal.market)}</span>
          {signal.selection_line != null && (
            <><span className="review-signal-sep">·</span><span>{signal.selection_line > 0 ? `+${signal.selection_line}` : signal.selection_line}</span></>
          )}
        </div>
      )}
      {text && <p className="review-signal-desc">{text}</p>}
      {signal.outcome_reason && (
        <p className="review-signal-reason"><Info size={11} />{signal.outcome_reason}</p>
      )}
    </div>
  );
}

// ─── Observation block ────────────────────────────────────────────────────────

function ObservationBlock({ obs, index }: { obs: ReviewObservation; index: number }) {
  const captureTime = formatUTCTime(obs.evaluated_at);
  const hasCohortNote = obs.in_performance_cohort === true;

  return (
    <details className="obs-block" open={index === 0}>
      <summary className="obs-header">
        <ChevronDown className="dropdown-chevron" size={13} />
        <span className="obs-time">{captureTime}</span>
        {hasCohortNote && <span className="obs-cohort-badge">Perf. cohort</span>}
        <span className="obs-signal-count">{obs.signal_count} {obs.signal_count === 1 ? "signal" : "signals"}</span>
      </summary>
      <div className="obs-body">
        {obs.signals.length === 0 ? (
          <p className="obs-empty">No signals in this observation.</p>
        ) : (
          obs.signals.map((signal, i) => (
            <ReviewSignalRow key={`${obs.id}-${i}`} signal={signal} />
          ))
        )}
      </div>
    </details>
  );
}

// ─── Retrospective analysis section ──────────────────────────────────────────

function RetroSignalRow({ signal }: { signal: RetrospectiveSignal }) {
  const label = signalDisplayLabel(signal);
  const teamName = signal.selected_team?.name || null;
  const side = teamName ?? (signal.predicted_side ? readable(signal.predicted_side) : null);
  const text = signal.description || signal.reason || null;

  return (
    <div className="review-signal-row review-signal-retro">
      <div className="review-signal-top">
        <strong className="review-signal-label">{label}</strong>
        {signal.outcome && <OutcomeBadge outcome={signal.outcome} />}
      </div>
      {side && (
        <div className="review-signal-meta">
          <span>{side}</span>
          {signal.market && <><span className="review-signal-sep">·</span><span>{readable(signal.market)}</span></>}
        </div>
      )}
      {text && <p className="review-signal-desc">{text}</p>}
    </div>
  );
}

function RetrospectiveSection({ retro }: { retro: RetrospectiveAnalysis }) {
  const signals = retro.signals ?? [];
  const limitations = retro.limitations ?? [];
  const isArchived = retro.market_provenance === "archived";

  return (
    <details className="retro-block">
      <summary className="retro-header">
        <ChevronDown className="dropdown-chevron" size={13} />
        <span>Retrospective analysis — today&apos;s rules applied to saved prices</span>
        <span className="retro-count">{signals.length} {signals.length === 1 ? "signal" : "signals"}</span>
      </summary>
      <div className="retro-body">
        {isArchived && (
          <p className="retro-notice">Prices retrieved after the fact, not observed live before kickoff.</p>
        )}
        {signals.length === 0 ? (
          <p className="obs-empty">No retrospective signals available.</p>
        ) : (
          signals.map((signal, i) => <RetroSignalRow key={i} signal={signal} />)
        )}
        {limitations.length > 0 && (
          <details className="retro-limitations">
            <summary>Limitations</summary>
            <ul>{limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </details>
        )}
      </div>
    </details>
  );
}

// ─── Score / result display ───────────────────────────────────────────────────

function ScoreDisplay({
  result,
  home,
  away,
}: {
  result: GameReview["result"];
  home: GameTeam;
  away: GameTeam;
}) {
  const homeName = home.name ?? "Home";
  const awayName = away.name ?? "Away";

  if (!result) {
    return (
      <div className="game-teams">
        <span>{awayName}</span>
        <span className="game-vs">vs</span>
        <span>{homeName}</span>
      </div>
    );
  }

  if (result.status === "final" && result.home_score != null && result.away_score != null) {
    return (
      <div className="game-teams game-teams-final">
        <span className={result.away_score > result.home_score ? "game-team-winner" : ""}>{awayName}</span>
        <span className="game-score">
          <strong>{result.away_score}</strong>
          <span className="game-score-sep">:</span>
          <strong>{result.home_score}</strong>
        </span>
        <span className={result.home_score > result.away_score ? "game-team-winner" : ""}>{homeName}</span>
      </div>
    );
  }

  return (
    <div className="game-teams">
      <span>{awayName}</span>
      <span className="game-vs">vs</span>
      <span>{homeName}</span>
      <span className="game-result-status">
        {readable(result.status)}{result.reason ? ` — ${result.reason}` : ""}
      </span>
    </div>
  );
}

// ─── Favorite line ────────────────────────────────────────────────────────────

function FavoriteLine({ favorite, home, away }: { favorite: GameFavorite; home: GameTeam; away: GameTeam }) {
  if (!favorite.side) {
    return <p className="game-favorite game-favorite-none">No unique team favorite established.</p>;
  }
  const favName = favorite.side === "home" ? (home.name ?? "Home") : favorite.side === "away" ? (away.name ?? "Away") : readable(favorite.side);
  const wonLabel = favorite.won === true ? " · Won" : favorite.won === false ? " · Lost" : "";
  const basis = favorite.basis ? ` · ${favorite.basis}` : "";
  return (
    <p className="game-favorite">
      Favorite: <strong>{favName}</strong>{wonLabel}{basis}
    </p>
  );
}

// ─── Main game card ───────────────────────────────────────────────────────────

export function GameReviewCard({ game, league }: { game: GameReview; league: string }) {
  const isFinal = game.result?.status === "final";
  const observations = game.observations;
  const observationsMissing = observations === undefined;
  const allEmpty = !observationsMissing && Array.isArray(observations) && observations.length > 0 && observations.every((o) => o.signal_count === 0);
  const hasRetro = game.retrospective_analysis != null && (
    (game.retrospective_analysis.signals?.length ?? 0) > 0 || game.retrospective_analysis.limitations != null
  );

  return (
    <div className="review-card">
      <div className="review-card-top">
        <span className={`status-badge ${isFinal ? "status-quiet" : "status-active"}`}>
          {isFinal ? "Final" : game.result ? readable(game.result.status) : "Scheduled"}
        </span>
        <span className="review-league-tag">{league}</span>
      </div>

      <ScoreDisplay result={game.result ?? null} home={game.home} away={game.away} />

      <p className="review-kickoff">
        {formatUTCDateTime(game.kickoff_at)}
      </p>

      {game.favorite && (
        <FavoriteLine favorite={game.favorite} home={game.home} away={game.away} />
      )}

      {game.odds == null && (
        <p className="review-no-odds">Historical odds unavailable.</p>
      )}

      {game.excluded_observations != null && game.excluded_observations > 0 && (
        <p className="review-coverage-note">
          <Info size={11} /> {game.excluded_observations} observation{game.excluded_observations === 1 ? "" : "s"} could not be safely associated with this game and were excluded from this review.
        </p>
      )}

      {/* Recorded observations section */}
      <div className="review-section">
        <h4 className="review-section-title">Recorded before kickoff</h4>
        {observationsMissing && (
          <p className="review-contract-warning">
            Observation data not returned — check that the backend deployment supports <code>include_observations=true</code>.
          </p>
        )}
        {!observationsMissing && observations!.length === 0 && (
          <p className="obs-empty-game">No eligible pregame signal records for this game.</p>
        )}
        {!observationsMissing && observations!.length > 0 && allEmpty && (
          <p className="obs-empty-game">No signals recorded in the available observations.</p>
        )}
        {!observationsMissing && observations!.length > 0 && (
          <div className="obs-list">
            {observations!.map((obs, i) => (
              <ObservationBlock key={obs.id} obs={obs} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Retrospective analysis — always in a separate, labeled section */}
      {hasRetro && (
        <div className="review-section">
          <RetrospectiveSection retro={game.retrospective_analysis!} />
        </div>
      )}
    </div>
  );
}
