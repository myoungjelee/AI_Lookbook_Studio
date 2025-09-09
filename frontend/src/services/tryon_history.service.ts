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

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, arr: T[]) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
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
    const list = [now, ...read<TryOnInputHistoryItem>(KEY_INPUTS)].slice(0, LIMIT);
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
