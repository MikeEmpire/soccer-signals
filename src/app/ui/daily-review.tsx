"use client";

import Link from "next/link";
import { Activity, AlertCircle, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ODDS_LEAGUES, type OddsLeague } from "../../lib/odds";
import { createReviewLoader, yesterdayUTC, type GameReview } from "../../lib/odds-review";
import { GameReviewCard } from "./game-review-card";
import { ReviewCalendar } from "./review-calendar";

export function DailyReview() {
  const [selectedLeague, setSelectedLeague] = useState<OddsLeague>(ODDS_LEAGUES[0]);
  const [date, setDate] = useState<string>(() => yesterdayUTC());
  const [games, setGames] = useState<GameReview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loader] = useState(() => createReviewLoader());

  const load = useCallback(
    (league: OddsLeague, d: string) => {
      setLoading(true);
      setError(null);
      setGames(null);
      loader.load(
        league.league,
        d,
        (results) => setGames(results),
        (msg) => setError(msg),
        () => setLoading(false),
      );
    },
    [loader],
  );

  useEffect(() => {
    load(selectedLeague, date);
    return () => loader.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague, date]);

  function changeLeague(league: OddsLeague) {
    if (league.key === selectedLeague.key) return;
    loader.cancel();
    setSelectedLeague(league);
    setGames(null);
    setError(null);
  }

  function dateLabel() {
    const yesterday = yesterdayUTC();
    const d = new Date(`${date}T12:00:00Z`);
    const todayUTC = new Date();
    const todayKey = `${todayUTC.getUTCFullYear()}-${String(todayUTC.getUTCMonth() + 1).padStart(2, "0")}-${String(todayUTC.getUTCDate()).padStart(2, "0")}`;
    if (date === todayKey) return "Today (UTC)";
    if (date === yesterday) return "Yesterday (UTC)";
    try {
      return d.toLocaleDateString(undefined, {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return date;
    }
  }

  const gameCount = games?.length ?? 0;

  return (
    <main className="dashboard-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="dashboard-container">
        <header className="site-header">
          <div className="brand-block">
            <div className="brand-icon"><Shield size={20} /></div>
            <div>
              <div className="eyebrow">Sports Signals</div>
              <h1>Daily Review</h1>
            </div>
          </div>
        </header>

        {/* Page navigation */}
        <nav className="page-nav" aria-label="Site sections">
          <Link href="/" className="page-nav-link">Live Odds</Link>
          <span className="page-nav-link page-nav-active" aria-current="page">Daily Review</span>
        </nav>

        {/* League selector */}
        <div className="toolbar">
          <nav className="filter-shell odds-league-filter" aria-label="Leagues">
            {ODDS_LEAGUES.map((league) => (
              <button
                key={league.key}
                type="button"
                aria-pressed={selectedLeague.key === league.key}
                className={selectedLeague.key === league.key ? "filter-active" : ""}
                onClick={() => changeLeague(league)}
              >
                {league.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Month calendar date selector */}
        <ReviewCalendar
          league={selectedLeague.league}
          selectedDate={date}
          onSelectDate={setDate}
        />

        {/* Section heading */}
        <div className="section-heading">
          <div>
            <span className="section-kicker section-kicker-active">{selectedLeague.label}</span>
            <h2>Signal review — {dateLabel()}</h2>
            <p>UTC kickoff date · Recorded signals and outcomes</p>
          </div>
          {games != null && (
            <span className="section-count active-count">{gameCount} {gameCount === 1 ? "game" : "games"}</span>
          )}
        </div>

        {/* Error banner — a failed request is not an empty date */}
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{games ? "Latest refresh failed. Showing the last successful update." : error}</span>
            <button type="button" disabled={loading} onClick={() => load(selectedLeague, date)}>
              Try again
            </button>
          </div>
        )}

        {/* Content */}
        <div aria-busy={loading}>
          {/* Loading skeleton */}
          {!games && loading && (
            <div className="loading-grid" role="status" aria-label="Loading games">
              {[0, 1].map((i) => (
                <div className="loading-card" key={i}>
                  <div className="skeleton skeleton-small" />
                  <div className="skeleton skeleton-title" />
                  <div className="skeleton skeleton-odds" />
                </div>
              ))}
            </div>
          )}

          {/* Empty day */}
          {games != null && games.length === 0 && !error && (
            <div className="empty-state">
              <Activity size={20} />
              <div>
                <strong>No stored games</strong>
                <span>No stored games for {selectedLeague.label} on this UTC date. This is a storage-coverage statement, not proof that no real games occurred.</span>
              </div>
            </div>
          )}

          {/* Game list */}
          {games != null && games.length > 0 && (
            <div className="review-grid">
              {games.map((game) => (
                <GameReviewCard
                  key={`${selectedLeague.league}:${game.event_id != null ? `odds:${game.event_id}` : game.game_id != null ? `game:${game.game_id}` : `id:${game.id}`}`}
                  game={game}
                  league={selectedLeague.mark}
                />
              ))}
            </div>
          )}
        </div>

        <footer>
          <span>Dates are UTC kickoff dates, not local calendar dates</span>
        </footer>
      </div>
    </main>
  );
}
