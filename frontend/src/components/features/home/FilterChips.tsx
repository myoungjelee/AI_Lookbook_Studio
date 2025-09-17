import React, { useState } from 'react';

const chips = [
  '러닝화',
  '헤드보드',
  '트레이닝',
  '카핑',
  '스토츠',
  '액티브웜',
  '로퍼',
  '스니커즈',
  '가멘트',
  '라이프스타일'
];

export const FilterChips: React.FC = () => {
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, index) => (
        <button
          key={chip}
          onClick={() => setActive(index)}
          className={`text-xs rounded-full px-4 py-1.5 border transition-colors ${
            active === index
              ? 'bg-[#111111] text-white border-[#111111]'
              : 'bg-white text-[var(--text-muted)] border-[var(--divider)] hover:text-[var(--text-strong)]'
          }`}
        >
          {chip}
        </button>
      ))}
    </div>
  );
};

export default FilterChips;
