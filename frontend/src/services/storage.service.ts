// localStorage 통합 관리 서비스
// 전체 용량을 체크하고 오래된 데이터부터 삭제하는 큐 시스템

type StorageItem = {
  key: string;
  priority: number; // 낮을수록 먼저 삭제됨
  maxItems: number;
  getItems: () => any[];
  setItems: (items: any[]) => void;
};

// 우선순위: 1(낮음) = 먼저 삭제, 5(높음) = 나중에 삭제
const STORAGE_CONFIG: StorageItem[] = [
  {
    key: "app:tryon:history:outputs:v1",
    priority: 1, // 출력 히스토리 (이미지가 많아서 용량 많이 차지)
    maxItems: 12,
    getItems: () => {
      try {
        const raw = localStorage.getItem("app:tryon:history:outputs:v1");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    setItems: (items) => {
      try {
        localStorage.setItem(
          "app:tryon:history:outputs:v1",
          JSON.stringify(items)
        );
      } catch {}
    },
  },
  {
    key: "app:tryon:history:inputs:v1",
    priority: 2, // 입력 히스토리
    maxItems: 12,
    getItems: () => {
      try {
        const raw = localStorage.getItem("app:tryon:history:inputs:v1");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    setItems: (items) => {
      try {
        localStorage.setItem(
          "app:tryon:history:inputs:v1",
          JSON.stringify(items)
        );
      } catch {}
    },
  },
  {
    key: "app:likes:v1",
    priority: 3, // 좋아요 (상품 정보만)
    maxItems: 50,
    getItems: () => {
      try {
        const raw = localStorage.getItem("app:likes:v1");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    setItems: (items) => {
      try {
        localStorage.setItem("app:likes:v1", JSON.stringify(items));
      } catch {}
    },
  },
  {
    key: "app:pendingVirtualFittingItems",
    priority: 4, // 대기 중인 피팅 아이템
    maxItems: 10,
    getItems: () => {
      try {
        const raw = localStorage.getItem("app:pendingVirtualFittingItems");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    setItems: (items) => {
      try {
        localStorage.setItem(
          "app:pendingVirtualFittingItems",
          JSON.stringify(items)
        );
      } catch {}
    },
  },
];

// localStorage 용량 체크 및 정리
export function manageStorageSpace() {
  // 우선순위 순으로 정렬 (낮은 숫자부터)
  const sortedConfig = [...STORAGE_CONFIG].sort(
    (a, b) => a.priority - b.priority
  );

  for (const config of sortedConfig) {
    try {
      const items = config.getItems();

      // 최대 개수 초과 시 오래된 것부터 삭제
      if (items.length > config.maxItems) {
        const limitedItems = items.slice(0, config.maxItems);
        config.setItems(limitedItems);
        console.log(
          `🗑️ ${config.key} 정리: ${items.length} → ${limitedItems.length}개`
        );
      }
    } catch (error) {
      console.warn(`localStorage 정리 실패 (${config.key}):`, error);

      // 용량 초과 시 더 적게 저장
      try {
        const items = config.getItems();
        const halfItems = items.slice(0, Math.floor(config.maxItems / 2));
        config.setItems(halfItems);
        console.log(
          `🔄 ${config.key} 강제 정리: ${items.length} → ${halfItems.length}개`
        );
      } catch {
        // 그래도 실패하면 해당 키 전체 삭제
        localStorage.removeItem(config.key);
        console.log(`💥 ${config.key} 완전 삭제`);
      }
    }
  }
}

// 특정 키의 데이터를 안전하게 저장 (용량 체크 포함)
export function safeSetItem(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn(`localStorage 저장 실패 (${key}):`, error);

    // 저장 실패 시 전체 정리 후 재시도
    manageStorageSpace();

    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      console.error(`localStorage 저장 재시도 실패 (${key})`);
      return false;
    }
  }
}

// localStorage 전체 용량 확인 (대략적)
export function getStorageUsage() {
  let totalSize = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      totalSize += localStorage[key].length;
    }
  }
  return {
    bytes: totalSize,
    kb: Math.round(totalSize / 1024),
    mb: Math.round((totalSize / 1024 / 1024) * 100) / 100,
  };
}

// 앱 시작 시 자동 정리
manageStorageSpace();
