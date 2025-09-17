import React from 'react';

interface Item { label: string }

const data: Item[] = [
  { label: '스니커즈' },
  { label: '러닝웜' },
  { label: '트레이닝' },
  { label: '카핑' },
  { label: '아웃도어' },
  { label: '라이프' },
  { label: '액세서리' },
  { label: '테크웜어' },
];

export const CategoryRow: React.FC = () => {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center gap-6 py-4">
        {data.map((item) => (
          <div key={item.label} className="w-20 flex-shrink-0">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--divider)] bg-[var(--surface-bg)] text-xs font-semibold text-[var(--text-base)]">
              {item.label}
            </div>
            <p className="mt-2 text-center text-xs text-[var(--text-muted)] truncate" title={item.label}>{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CategoryRow;
