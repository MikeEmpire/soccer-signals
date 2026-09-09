"use client";

import { SignalDetails } from "./odds-signal";
import { ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { moneyline, readable } from "../../lib/odds";
import { formatMovement, historyStore, historyUrl, HISTORY_MAX_AGE, precedingSnapshot, type HistoryData, type HistoryEvent, type HistoryState } from "../../lib/odds-history";

export function HistoryTable({ data, event }: { data: HistoryData; event: HistoryEvent & { away_team: string; home_team: string } }) {
  const sides = [{ key: "away_ml", label: event.away_team }, ...(event.sport === "soccer" ? [{ key: "draw_ml", label: "Draw" }] : []), { key: "home_ml", label: event.home_team }] as { key: "away_ml" | "draw_ml" | "home_ml"; label: string }[];
  if (!data.history.length) return <p className="history-empty">No odds snapshots have been recorded yet.</p>;
  return <><p className="context-note">Oldest first · Times are local. Movement is current minus preceding moneyline for the same sportsbook. Positive means longer odds and negative means shorter odds within the same sign; crossing even money is labeled separately. Movement does not indicate a favorable bet. Simultaneous captures, phase changes, and nonstandard prices have no calculated movement.</p>
    <div className="history-table-scroll" tabIndex={0} role="region" aria-label="Chronological odds snapshots"><table className="odds-history-table"><caption>Sportsbook moneyline snapshots</caption><thead><tr><th scope="col">Captured / sportsbook</th><th scope="col">Line phase</th>{sides.map(side => <th scope="col" key={side.key}>{side.label}<small>Moneyline / movement</small></th>)}</tr></thead><tbody>{data.history.map((row, index) => {
      const previous = precedingSnapshot(data.history, index);
      return <Fragment key={`${row.provider_id}:${row.snapshot_id}`}><tr><th scope="row"><time dateTime={row.captured_at}>{new Date(row.captured_at).toLocaleString()}</time><small>{row.provider_name}{row.is_backfill ? " · Backfill" : ""}</small></th><td>{row.line_phase ? readable(row.line_phase) : "—"}</td>{sides.map(side => <td key={side.key}><strong>{moneyline(row[side.key])}</strong><small>{formatMovement(row[side.key], previous?.[side.key])}</small></td>)}</tr>{event.sport === "soccer" && <tr><td colSpan={sides.length + 2} className="history-signals"><details className="signal-dropdown"><summary>Signals at this snapshot{row.signal_count != null ? ` · ${row.signal_count}` : ""}<ChevronDown size={14} /></summary>
        {row.signals === undefined ? <p className="context-note">Signal history unavailable.</p> : row.signals.length === 0 ? <p className="context-note">No signals at this snapshot.</p> : row.signals.map((signal, signalIndex) => <SignalDetails key={`${signal.rule}:${signalIndex}`} event={event} signal={signal} />)}
      </details></td></tr>}</Fragment>;
    })}</tbody></table></div></>;
}

export function HistoryContent({ state, event, retry }: { state: HistoryState; event: HistoryEvent & { away_team: string; home_team: string }; retry: () => void }) {
  return <div aria-busy={state.loading}>
    {state.loading && <p className="history-loading" role="status">{state.data ? "Refreshing odds history…" : "Loading odds history…"}</p>}
    {state.error && <div className="history-error" role="status"><span>{state.data ? `History may be outdated · latest refresh failed. ${state.error}` : state.error}</span><button type="button" onClick={retry} disabled={state.loading}>Retry history</button></div>}
    {state.data && <HistoryTable data={state.data} event={event} />}
    {state.data && !state.error && <button type="button" className="history-refresh" disabled={state.loading} onClick={retry}>Refresh history</button>}
  </div>;
}

function EventHistory({ url, event }: { url: string | null; event: HistoryEvent & { away_team: string; home_team: string } }) {
  const [open, setOpen] = useState(false);
  const subscribe = useCallback((listener: () => void) => open && url ? historyStore.subscribe(url, listener) : () => {}, [open, url]);
  const getSnapshot = useCallback(() => historyStore.getSnapshot(url), [url]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!open || !url) return;
    const refresh = () => { if (document.visibilityState !== "hidden") void historyStore.load(url); };
    refresh();
    const interval = window.setInterval(refresh, HISTORY_MAX_AGE);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [open, url]);
  return <details className="signal-dropdown event-odds-history" onToggle={event => setOpen(event.currentTarget.open)}><summary>Odds history<ChevronDown className="dropdown-chevron" size={14} /></summary>
    {open && (url ? <HistoryContent state={state} event={event} retry={() => { void historyStore.load(url, true); }} /> : <p className="history-empty">Odds history is unavailable for this event.</p>)}
  </details>;
}

export function OddsHistory({ event }: { event: HistoryEvent & { away_team: string; home_team: string } }) {
  const url = historyUrl(event);
  // Reset expansion and subscriptions immediately when event, provider, sport or league changes.
  return <EventHistory key={url ?? `${event.sport}:${event.league}:${event.provider}:${event.provider_event_id}`} url={url} event={event} />;
}
