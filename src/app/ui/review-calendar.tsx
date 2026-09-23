"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CalendarDate, CalendarMonth } from "../../lib/odds-review";

// Session cache: key = "league:YYYY-MM", expires per backend expires_at
const calendarCache = new Map<string, { data: CalendarMonth; expiresAt: number }>();

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function utcMonthYM(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  try {
    return new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(undefined, {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    });
  } catch {
    return ym;
  }
}

// Returns a flat 7-col array of day numbers (null = padding); week starts Monday.
function buildGrid(ym: string): (number | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun
  const startOffset = (firstDow + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return utcMonthYM(new Date(Date.UTC(y, m - 1 + delta, 1)));
}

function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function ReviewCalendar({
  league,
  selectedDate,
  onSelectDate,
}: {
  league: string;        // e.g. "eng.1"
  selectedDate: string;  // YYYY-MM-DD
  onSelectDate: (date: string) => void;
}) {
  const [displayMonth, setDisplayMonth] = useState<string>(() => selectedDate.slice(0, 7));
  const [calData, setCalData] = useState<CalendarMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);

  // If the selected date moves to a different month (e.g., external change), follow it.
  useEffect(() => {
    const m = selectedDate.slice(0, 7);
    if (m !== displayMonth) setDisplayMonth(m);
    // Only react to selectedDate, not displayMonth (user navigating months independently).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const cacheKey = `${league}:${displayMonth}`;
    const cached = calendarCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setCalData(cached.data);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    void (async () => {
      try {
        const res = await fetch(
          `/api/odds/calendar/?${new URLSearchParams({ league, month: displayMonth })}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data: CalendarMonth = await res.json();
        const expiresAt = data.expires_at
          ? new Date(data.expires_at).getTime()
          : Date.now() + 15 * 60_000;
        calendarCache.set(cacheKey, { data, expiresAt });
        if (!controller.signal.aborted) {
          setCalData(data);
          setLoading(false);
        }
      } catch (err) {
        if (!controller.signal.aborted && (err instanceof Error && err.name !== "AbortError")) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [league, displayMonth]);

  const today = todayUTC();
  const todayMonth = today.slice(0, 7);

  // Build an index of available dates from the backend response.
  const dateIndex = new Map<string, CalendarDate>(
    (calData?.dates ?? []).map((d) => [d.date, d]),
  );

  const grid = buildGrid(displayMonth);

  // Use backend-provided previous/next when available; fall back to simple math.
  const prevMonth = calData?.previous_month ?? shiftMonth(displayMonth, -1);
  const nextMonth = calData?.next_month ?? shiftMonth(displayMonth, 1);
  const canGoNext = nextMonth <= todayMonth;

  return (
    <div className="cal-shell">
      <div className="cal-header">
        <button
          type="button"
          className="cal-nav-btn"
          aria-label="Previous month"
          disabled={prevMonth == null}
          onClick={() => prevMonth && setDisplayMonth(prevMonth)}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="cal-month-label">
          {monthLabel(displayMonth)}
          {loading && <Loader2 size={11} className="cal-loading-icon" />}
        </span>
        <button
          type="button"
          className="cal-nav-btn"
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={() => canGoNext && setDisplayMonth(nextMonth)}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {error && !loading && (
        <p className="cal-error">
          Calendar data unavailable — all dates can still be browsed.
        </p>
      )}

      <div className="cal-grid" role="grid" aria-label={`${monthLabel(displayMonth)} calendar`}>
        {/* Day-of-week headers */}
        {DAY_LABELS.map((d) => (
          <div key={d} className="cal-day-header" role="columnheader" aria-label={d}>{d}</div>
        ))}

        {/* Day cells */}
        {grid.map((day, i) => {
          if (day === null) {
            return <div key={`pad-${i}`} className="cal-day cal-day-pad" role="gridcell" aria-hidden="true" />;
          }
          const dateStr = `${displayMonth}-${String(day).padStart(2, "0")}`;
          const info = dateIndex.get(dateStr);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const hasGames = !!info;
          const hasSignals = info?.has_recorded_signals ?? false;
          const hasResults = !hasSignals && (info?.has_results ?? false);

          return (
            <button
              key={dateStr}
              type="button"
              role="gridcell"
              aria-label={`${dateStr}${info ? `, ${info.game_count} game${info.game_count === 1 ? "" : "s"}` : ""}`}
              aria-pressed={isSelected}
              className={[
                "cal-day",
                isSelected ? "cal-day-selected" : "",
                isToday && !isSelected ? "cal-day-today" : "",
                hasGames && !isSelected ? "cal-day-available" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onSelectDate(dateStr)}
            >
              <span className="cal-day-num">{day}</span>
              {hasGames && !isSelected && (
                <span className="cal-dots" aria-hidden="true">
                  {hasSignals && <span className="cal-dot cal-dot-signals" />}
                  {hasResults && <span className="cal-dot cal-dot-results" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
