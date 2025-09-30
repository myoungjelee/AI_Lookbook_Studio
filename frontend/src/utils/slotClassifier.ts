/**
 * 슬롯 데이터 구분 유틸리티
 * 내부 데이터와 외부 데이터를 구분하는 로직
 */

export interface SlotItem {
  id?: string;
  pos?: number;
  base64?: string;
  mimeType?: string;
  isExternal?: boolean;
  title?: string;
  price?: number;
  category?: string;
  imageUrl?: string;
  productUrl?: string;
  tags?: string[];
}

export interface CategorizedSlots {
  internalSlots: Record<string, SlotItem>;
  externalSlots: Record<string, SlotItem>;
}

/**
 * 슬롯 아이템이 외부 데이터인지 확인
 */
export function isExternalSlot(item: SlotItem | null | undefined): boolean {
  if (!item) return false;

  // 외부 데이터 조건
  if (item.isExternal === true) return true;

  if (item.base64 && !item.pos && !item.id) return true;

  return false;
}

/**
 * 슬롯 아이템이 내부 데이터인지 확인
 */
export function isInternalSlot(item: SlotItem | null | undefined): boolean {
  if (!item) return false;

  // 내부 데이터 조건
  if (item.pos !== undefined) return true;

  if (item.id && !item.isExternal) return true;

  return false;
}

/**
 * 슬롯 데이터를 내부/외부로 분류
 */
export function categorizeSlots(
  clothingSlots: Record<string, SlotItem | null>
): CategorizedSlots {
  const internalSlots: Record<string, SlotItem> = {};
  const externalSlots: Record<string, SlotItem> = {};

  for (const [slotName, item] of Object.entries(clothingSlots)) {
    if (!item) continue;

    if (isExternalSlot(item)) {
      externalSlots[slotName] = item;
    } else if (isInternalSlot(item)) {
      internalSlots[slotName] = item;
    }
  }

  return { internalSlots, externalSlots };
}

/**
 * 슬롯 아이템의 타입을 반환
 */
export function getSlotType(
  item: SlotItem | null | undefined
): "internal" | "external" | "empty" | "unknown" {
  if (!item) return "empty";

  if (isExternalSlot(item)) return "external";
  if (isInternalSlot(item)) return "internal";

  return "unknown";
}

/**
 * 슬롯 데이터가 올바른 형식인지 검증
 */
export function validateSlotData(
  item: SlotItem | null | undefined,
  slotType: "internal" | "external"
): boolean {
  if (!item) return false;

  if (slotType === "external") {
    // 외부 데이터: base64와 mimeType 필요
    return !!(item.base64 && item.mimeType);
  }

  if (slotType === "internal") {
    // 내부 데이터: pos 또는 id 필요
    return !!(item.pos !== undefined || item.id);
  }

  return false;
}

/**
 * 외부 이미지 데이터 생성
 */
export function createExternalSlotData(
  base64: string,
  mimeType: string
): SlotItem {
  return {
    base64,
    mimeType,
    isExternal: true,
  };
}

/**
 * 내부 아이템 데이터 생성
 */
export function createInternalSlotData(item: {
  id: string;
  pos?: number;
  title: string;
  price: number;
  category: string;
  imageUrl?: string;
  productUrl?: string;
  tags?: string[];
}): SlotItem {
  return {
    id: item.id,
    pos: item.pos,
    title: item.title,
    price: item.price,
    category: item.category,
    imageUrl: item.imageUrl,
    productUrl: item.productUrl,
    tags: item.tags || [],
  };
}
