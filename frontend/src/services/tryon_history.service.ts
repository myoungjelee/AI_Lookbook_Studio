import type { RecommendationItem } from "../types";

export type TryOnInputHistoryItem = {
  id: string;
  ts: number;
  person: "model" | "upload" | "unknown";
  topLabel?: string;
  pantsLabel?: string;
  shoesLabel?: string;
  outerLabel?: string;
  // 상품 ID로 중복 체크용
  topProductId?: string;
  pantsProductId?: string;
  shoesProductId?: string;
  outerProductId?: string;
  // 상품 데이터 (이미지 URL 포함)
  topProduct?: RecommendationItem;
  pantsProduct?: RecommendationItem;
  shoesProduct?: RecommendationItem;
  outerProduct?: RecommendationItem;
};

export type TryOnOutputHistoryItem = {
  id: string;
  ts: number;
  image: string; // data URI
  evaluation?: {
    score: number;
    reasoning?: string;
    model?: string;
    ts: number;
  };
};

import { safeSetItem } from "./storage.service";

const KEY_INPUTS = "app:tryon:history:inputs:v1";
const KEY_OUTPUTS = "app:tryon:history:outputs:v1";

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
  safeSetItem(key, arr);
  notify();
}

function notify() {
  console.log("🔔 tryOnHistory notify 호출됨, listeners 수:", listeners.size);
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
}

export const tryOnHistory = {
  // 디버깅용: listeners에 접근 가능하도록
  get listeners() {
    return listeners;
  },

  // 임시: 모든 히스토리 데이터 클리어 (개발용)
  clearAll() {
    console.log("🗑️ 모든 히스토리 데이터 클리어 중...");
    localStorage.removeItem(KEY_INPUTS);
    localStorage.removeItem(KEY_OUTPUTS);
    notify();
    console.log("✅ 히스토리 데이터 클리어 완료");
  },
  addInput(item: Omit<TryOnInputHistoryItem, "id" | "ts">) {
    // Drop entries that are only AI-model person without any clothing labels
    if (
      item.person !== "upload" &&
      !item.topLabel &&
      !item.pantsLabel &&
      !item.shoesLabel &&
      !item.outerLabel
    ) {
      return;
    }

    // 중복 체크: 같은 상품이 이미 히스토리에 있는지 확인 (슬롯 무관)
    const existingList = read<TryOnInputHistoryItem>(KEY_INPUTS);
    const isDuplicate = existingList.some((existing) => {
      // 상품 ID가 있는 경우에만 중복 체크
      const itemProductIds = [
        item.topProductId,
        item.pantsProductId,
        item.shoesProductId,
        item.outerProductId,
      ].filter(Boolean);

      const existingProductIds = [
        existing.topProductId,
        existing.pantsProductId,
        existing.shoesProductId,
        existing.outerProductId,
      ].filter(Boolean);

      // 상품 ID가 없으면 중복 체크 안함 (업로드 이미지 등)
      if (itemProductIds.length === 0) {
        return false;
      }

      // 같은 상품 ID가 하나라도 있으면 중복
      return itemProductIds.some((id) => existingProductIds.includes(id));
    });

    if (isDuplicate) {
      console.log("중복된 상품이므로 히스토리에 추가하지 않음", {
        item: {
          topProductId: item.topProductId,
          pantsProductId: item.pantsProductId,
          shoesProductId: item.shoesProductId,
          outerProductId: item.outerProductId,
        },
        existing: existingList.map((ex) => ({
          topProductId: ex.topProductId,
          pantsProductId: ex.pantsProductId,
          shoesProductId: ex.shoesProductId,
          outerProductId: ex.outerProductId,
        })),
      });
      return;
    }

    const now: TryOnInputHistoryItem = {
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
      ...item,
    };
    const list = [now, ...existingList];
    write(KEY_INPUTS, list);
  },
  addOutput(imageDataUri: string) {
    const now: TryOnOutputHistoryItem = {
      id: `o-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
      image: imageDataUri,
    };
    const list = [now, ...read<TryOnOutputHistoryItem>(KEY_OUTPUTS)];
    write(KEY_OUTPUTS, list);
  },
  updateOutput(id: string, patch: Partial<TryOnOutputHistoryItem>) {
    const list = read<TryOnOutputHistoryItem>(KEY_OUTPUTS);
    const idx = list.findIndex((it) => it.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      write(KEY_OUTPUTS, list);
    }
  },
  inputs(): TryOnInputHistoryItem[] {
    return read<TryOnInputHistoryItem>(KEY_INPUTS);
  },
  outputs(): TryOnOutputHistoryItem[] {
    return read<TryOnOutputHistoryItem>(KEY_OUTPUTS);
  },
  clearInputs() {
    write(KEY_INPUTS, []);
  },
  clearOutputs() {
    write(KEY_OUTPUTS, []);
  },
  removeInput(id: string) {
    const list = read<TryOnInputHistoryItem>(KEY_INPUTS);
    const filtered = list.filter((item) => item.id !== id);
    write(KEY_INPUTS, filtered);
  },
  removeOutput(id: string) {
    const list = read<TryOnOutputHistoryItem>(KEY_OUTPUTS);
    const filtered = list.filter((item) => item.id !== id);
    write(KEY_OUTPUTS, filtered);
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export default tryOnHistory;
