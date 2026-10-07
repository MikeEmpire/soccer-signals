import { deadlineIsCurrent, NFL_BOOKS, numberLabel, type DisplayQuote, type Numeric, type ReceivingBook, type ReceivingCard, type ReceivingSignal } from './nfl-receiving';

export type TDSide = 'yes' | 'no';
export function probabilityLabel(value: Numeric | undefined) {
  return value == null || value === '' ? '—' : `${numberLabel(Number(value) * 100)}%`;
}
export function pointsLabel(value: Numeric | undefined) {
  return value == null || value === '' ? '—' : `${numberLabel(Number(value) * 100, true)} pp`;
}
export function impliedProbability(odds: Numeric | undefined): number | null {
  if (odds == null || odds === '' || !Number.isFinite(Number(odds)) || Math.abs(Number(odds)) < 100) return null;
  const n = Number(odds);
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}
export function displayTDSide(book: ReceivingBook | undefined, side: TDSide, now: number, outdated = false, sample = false): DisplayQuote {
  const missing: DisplayQuote = { status: 'missing', line: null, odds: null, observedAt: null, staleReasons: [] };
  if (!book) return missing;
  const saved = book.latest_saved?.[side];
  if (saved?.status === 'withdrawn' || saved?.status === 'invalid_timestamp') return { ...missing, status: saved.status };
  const odds = book[`${side}_odds`];
  if (!outdated && (sample || deadlineIsCurrent(book[`${side}_expires_at`], now)) && impliedProbability(odds) != null) {
    return { ...missing, status: 'fresh', odds: odds!, observedAt: saved?.last_seen_at ?? (side === 'yes' ? book.last_seen_at : null) };
  }
  if (saved && impliedProbability(saved.american_odds) != null) {
    return { ...missing, status: !outdated && saved.status === 'fresh' && deadlineIsCurrent(saved.expires_at, now) ? 'fresh' : 'stale',
      odds: saved.american_odds, observedAt: saved.last_seen_at, providerUpdatedAt: saved.provider_updated_at, staleReasons: saved.stale_reasons ?? [] };
  }
  return missing;
}
export function tdComparison(card: ReceivingCard, side: TDSide, now: number, outdated = false, sample = false) {
  const quotes = NFL_BOOKS.map(id => ({ id, quote: displayTDSide(card.market.books.find(b => b.id === id), side, now, outdated, sample) }));
  const current = quotes.filter(item => item.quote.status === 'fresh');
  if (current.length >= 2) {
    const values = current.map(item => impliedProbability(item.quote.odds)!).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return { probability: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2, current: true, count: current.length };
  }
  const context = card.market.saved_comparison;
  const saved = context?.source === 'latest_saved_main_prices' ? context.sides[side] : undefined;
  // An explicit withdrawal supersedes the saved aggregate as well as the row.
  const usable = saved && saved.books.every(book => quotes.some(item => item.id === book.bookmaker
    && ['fresh', 'stale'].includes(item.quote.status) && Number(item.quote.odds) === Number(book.american_odds)));
  return { probability: usable && saved.implied_probability != null ? Number(saved.implied_probability) : null, current: false, count: usable ? saved.books_available : current.length };
}
export function tdSignalIsCurrent(card: ReceivingCard, signal: ReceivingSignal | undefined | null, now: number, outdated = false, sample = false) {
  if (!signal || signal.status !== 'eligible' || !signal.comparison_side || outdated) return false;
  const side = signal.comparison_side;
  if (signal.direction !== 'PASS' && signal.direction.toLowerCase() !== side) return false;
  const prices = Object.entries(signal.book_probabilities ?? {});
  return prices.length >= 2 && prices.every(([id, probability]) => {
    if (!NFL_BOOKS.includes(id as typeof NFL_BOOKS[number]) || probability == null) return false;
    const quote = displayTDSide(card.market.books.find(book => book.id === id), side, now, outdated, sample);
    const implied = impliedProbability(quote.odds);
    return quote.status === 'fresh' && implied != null && Math.abs(implied - Number(probability)) < 0.000001;
  });
}
