export type TryOnInputHistoryItem = {
  id: string;
  ts: number;
  person: 'model' | 'upload' | 'unknown';
  topLabel?: string;
  pantsLabel?: string;
  shoesLabel?: string;
  // optional data URLs for quick preview
  personImage?: string;
  topImage?: string;
  pantsImage?: string;
  shoesImage?: string;
};

export type TryOnOutputHistoryItem = {
  id: string;
  ts: number;
  image: string; // data URI
  evaluation?: { score: number; reasoning?: string; model?: string; ts: number };
};

const KEY_INPUTS = 'app:tryon:history:inputs:v1';
const KEY_OUTPUTS = 'app:tryon:history:outputs:v1';
const LIMIT = 8; // keep lightweight

type Listener = () => void;
const listeners: Set<Listener> = new Set();

// In-memory short-term dedup cache to guard against rapid double inserts
const recentInputKeys: Map<string, number> = new Map();
const RECENT_TTL_MS = 1500;
function pruneRecent(nowTs: number) {
  for (const [k, t] of Array.from(recentInputKeys.entries())) {
    if (nowTs - t > RECENT_TTL_MS) recentInputKeys.delete(k);
  }
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, arr: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (err) {
    // Expose failures during development to help diagnose quota or serialization issues
    try { console.warn('[tryOnHistory] write failed for', key, err); } catch {}
  }
}

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

export const tryOnHistory = {
  addInput(item: Omit<TryOnInputHistoryItem, 'id' | 'ts'>) {
    // Drop entries that are only AI-model person without any clothing images
    if (item.person !== 'upload' && !item.topImage && !item.pantsImage && !item.shoesImage) {
      return;
    }
    const now: TryOnInputHistoryItem = { id: `h-${Date.now()}-${Math.random().toString(36).slice(2)}`, ts: Date.now(), ...item };
    const existing = read<TryOnInputHistoryItem>(KEY_INPUTS);

    // Simple de-duplication: if the newest entry matches exactly within a short window, skip
    const head = existing[0];
    const payloadOf = (x: TryOnInputHistoryItem) => JSON.stringify({
      person: x.person,
      topLabel: x.topLabel || '',
      pantsLabel: x.pantsLabel || '',
      shoesLabel: x.shoesLabel || '',
      personImage: x.personImage || '',
      topImage: x.topImage || '',
      pantsImage: x.pantsImage || '',
      shoesImage: x.shoesImage || '',
    });
    const sameAsHead = !!head && payloadOf(head) === payloadOf(now) && (now.ts - head.ts) < 1200;
    if (sameAsHead) {
      return;
    }

    // Guard against two rapid calls with identical payload even if not strictly head
    const key = payloadOf(now);
    pruneRecent(now.ts);
    const lastTs = recentInputKeys.get(key);
    if (typeof lastTs === 'number' && (now.ts - lastTs) < RECENT_TTL_MS) {
      return;
    }
    recentInputKeys.set(key, now.ts);

    const list = [now, ...existing].slice(0, LIMIT);
    write(KEY_INPUTS, list);
    notify();
  },
  addOutput(imageDataUri: string) {
    const now: TryOnOutputHistoryItem = { id: `o-${Date.now()}-${Math.random().toString(36).slice(2)}`, ts: Date.now(), image: imageDataUri };
    const list = [now, ...read<TryOnOutputHistoryItem>(KEY_OUTPUTS)].slice(0, LIMIT);
    write(KEY_OUTPUTS, list);
    notify();
  },
  updateOutput(id: string, patch: Partial<TryOnOutputHistoryItem>) {
    const list = read<TryOnOutputHistoryItem>(KEY_OUTPUTS);
    const idx = list.findIndex(it => it.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      write(KEY_OUTPUTS, list);
      notify();
    }
  },
  inputs(): TryOnInputHistoryItem[] { return read<TryOnInputHistoryItem>(KEY_INPUTS); },
  outputs(): TryOnOutputHistoryItem[] { return read<TryOnOutputHistoryItem>(KEY_OUTPUTS); },
  clearInputs() { write(KEY_INPUTS, []); notify(); },
  clearOutputs() { write(KEY_OUTPUTS, []); notify(); },
  subscribe(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); },
};

export default tryOnHistory;
