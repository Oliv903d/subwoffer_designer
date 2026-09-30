/**
 * Snapshot-based undo/redo. Snapshots are immutable document states, so
 * storing references is cheap and restoring is always exact.
 */
export interface History<T> {
  past: T[];
  future: T[];
  /** Consecutive edits with the same key (e.g. typing in one field) merge into one step. */
  coalesceKey: string | null;
}

const LIMIT = 200;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], coalesceKey: null };
}

/** Records `previous` as an undo step before a change is applied. */
export function record<T>(h: History<T>, previous: T, coalesceKey?: string): History<T> {
  if (coalesceKey && coalesceKey === h.coalesceKey) {
    return { ...h, future: [] };
  }
  return { past: [...h.past, previous].slice(-LIMIT), future: [], coalesceKey: coalesceKey ?? null };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null;
  const value = h.past[h.past.length - 1];
  return {
    value,
    history: { past: h.past.slice(0, -1), future: [current, ...h.future], coalesceKey: null },
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null;
  const [value, ...rest] = h.future;
  return {
    value,
    history: { past: [...h.past, current], future: rest, coalesceKey: null },
  };
}

export function endCoalesce<T>(h: History<T>): History<T> {
  return h.coalesceKey === null ? h : { ...h, coalesceKey: null };
}
