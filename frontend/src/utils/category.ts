export type SlotKey = 'top' | 'pants' | 'shoes' | 'outer' | 'accessories';

const RULES: Array<{ key: SlotKey; includes: string[] }> = [
  { key: 'outer', includes: ['outer', 'jacket', 'coat', 'cardigan', '아우터', '패딩'] },
  { key: 'top', includes: ['top', 'tee', 't-shirt', 'shirt', 'sweater', 'hoodie', '상의', '블라우스'] },
  { key: 'pants', includes: ['pant', 'pants', 'bottom', 'denim', 'jean', 'skirt', 'trouser', '하의', '슬랙스'] },
  { key: 'shoes', includes: ['shoe', 'shoes', 'sneaker', 'boots', 'loafer', '신발', '스니커'] },
  { key: 'accessories', includes: ['access', 'bag', 'belt', 'cap', 'hat', 'watch', 'necklace', 'acc', '양말', '모자', '가방'] },
];

export function normalizeCategoryLoose(value: string | undefined | null): SlotKey {
  const v = String(value ?? '').toLowerCase();
  if (!v) return 'accessories';
  for (const rule of RULES) {
    if (rule.includes.some((tok) => v.includes(tok))) return rule.key;
  }
  return 'accessories';
}

