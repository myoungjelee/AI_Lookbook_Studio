import type { RecommendationItem } from "../types";
import { safeSetItem } from "./storage.service";

const STORAGE_KEY = "app:likes:v1";

type Listener = (items: RecommendationItem[]) => void;

function read(): RecommendationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecommendationItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: RecommendationItem[]) {
  safeSetItem(STORAGE_KEY, items);
}

const listeners: Set<Listener> = new Set();

function notify(items: RecommendationItem[]) {
  listeners.forEach((fn) => {
    try {
      fn(items);
    } catch {
      /* noop */
    }
  });
}

export const likesService = {
  getAll(): RecommendationItem[] {
    return read();
  },
  isLiked(id: string): boolean {
    return read().some((x) => x.id === id);
  },
  add(item: RecommendationItem) {
    const items = read();
    if (!items.some((x) => x.id === item.id)) {
      const next = [item, ...items];
      write(next);
      notify(next);
    }
  },
  remove(id: string) {
    const items = read();
    const next = items.filter((x) => x.id !== id);
    write(next);
    notify(next);
  },
  toggle(item: RecommendationItem): boolean {
    const items = read();
    const exists = items.some((x) => x.id === item.id);
    const next = exists
      ? items.filter((x) => x.id !== item.id)
      : [item, ...items];
    write(next);
    notify(next);
    return !exists;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export type { RecommendationItem };
