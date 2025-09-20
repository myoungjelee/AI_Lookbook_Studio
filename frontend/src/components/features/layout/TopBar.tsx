import React, { useState } from 'react';

interface TopBarProps {
  onNavigate?: (page: 'home' | 'try-on' | 'likes' | 'my') => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onNavigate }) => {
  const envLogo = (import.meta as any).env?.VITE_LOGO_URL as string | undefined;
  const [logoSrc, setLogoSrc] = useState<string>(envLogo || '/logo.png');
  const handleLogoError = () => {
    if (!envLogo && logoSrc !== '/logo.jpg') {
      setLogoSrc('/logo.jpg');
    } else if (!envLogo && logoSrc !== '/logo.jpg.png') {
      setLogoSrc('/logo.jpg.png');
    } else {
      // give up; keep empty to allow text fallback
      setLogoSrc('');
    }
  };
  const primaryNav: Array<{ id: string; label: string; go?: 'home' | 'try-on' | 'likes' | 'my' }> = [
    { id: 'musinsa', label: 'MUSINSA', go: 'home' },
    { id: 'beauty', label: 'BEAUTY' },
    { id: 'player', label: 'PLAYER' },
    { id: 'outlet', label: 'OUTLET' },
    { id: 'boutique', label: 'BOUTIQUE' },
    { id: 'shoes', label: 'SHOES' },
    { id: 'kids', label: 'KIDS' },
    { id: 'used', label: 'USED' },
  ];

  const utilityNav = [
    { id: 'store', label: '오프라인 스토어' },
    // 검색: 메인 섹션의 검색 입력을 사용하므로 제거
    { id: 'likes', label: '좋아요', go: 'likes' as const },
    { id: 'my', label: '마이', go: 'my' as const },
    { id: 'login', label: '로그인 / 회원가입' },
  ];

  const secondaryNav: Array<{ id: string; label: string; go?: 'home' | 'try-on' | 'likes' | 'my' }> = [
    { id: 'recommend', label: '추천', go: 'home' },
    { id: 'ranking', label: '랭킹' },
    { id: 'sale', label: '세일' },
    { id: 'brand', label: '브랜드' },
    { id: 'new', label: '발매' },
    { id: 'fashion', label: '패션 매거진' },
    { id: 'spa', label: 'SPA샵' },
    { id: 'try-on', label: '버추얼 피팅', go: 'try-on' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-30 shadow-sm">
      <div className="bg-[#FEF8E7] text-gray-900">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-8">
          {primaryNav.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => item.go && onNavigate?.(item.go)}
              aria-label={idx === 0 ? 'Home' : undefined}
              className={`${idx === 0 ? 'flex items-center' : 'text-sm font-medium tracking-wide hover:text-gray-700'} transition-colors`}
            >
              {idx === 0 ? (
                logoSrc ? (
                  <img src={logoSrc} alt="logo" className="h-6 w-auto object-contain" onError={handleLogoError} />
                ) : (
                  <span className="text-lg font-extrabold tracking-tight">MUSINSA</span>
                )
              ) : (
                item.label
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-4 text-xs text-gray-600">
            {utilityNav.map(item => (
              <button
                key={item.id}
                onClick={() => item.go && onNavigate?.(item.go)}
                className="transition-colors hover:text-gray-900"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-[#ecdcb7] bg-[#FEF8E7] text-gray-900">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center gap-5 px-8 text-sm">
          {secondaryNav.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => item.go && onNavigate?.(item.go)}
              className={`border-b-2 border-transparent pb-1 font-medium tracking-tight transition-all hover:border-gray-900/40 hover:text-gray-900 ${idx === 0 ? 'border-gray-900 text-gray-900' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

export default TopBar;

