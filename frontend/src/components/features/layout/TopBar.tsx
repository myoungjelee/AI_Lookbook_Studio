import React, { useState } from "react";

interface TopBarProps {
  onNavigate?: (page: "home" | "try-on" | "likes" | "my") => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onNavigate }) => {
  const envLogo = (import.meta as any).env?.VITE_LOGO_URL as string | undefined;
  const [logoSrc, setLogoSrc] = useState<string>(envLogo || "/logo.png");
  const [searchTerm, setSearchTerm] = useState("");
  // const handleLogoError = () => {
  //   if (!envLogo && logoSrc !== '/logo.jpg') {
  //     setLogoSrc('/logo.jpg');
  //   } else if (!envLogo && logoSrc !== '/logo.jpg.png') {
  //     setLogoSrc('/logo.jpg.png');
  //   } else {
  //     // give up; keep empty to allow text fallback
  //     setLogoSrc('');
  //   }
  // };
  const primaryNav: Array<{
    id: string;
    label: string;
    go?: "home" | "try-on" | "likes" | "my";
  }> = [
    { id: "musinsa", label: "MUSINSA", go: "home" },
    { id: "beauty", label: "2025추석" },
    { id: "player", label: "GIFT" },
    { id: "outlet", label: "SHOW" },
    { id: "boutique", label: "BEST" },
    { id: "shoes", label: "NEW" },
    { id: "kids", label: "Brand" },
    { id: "used", label: "Re.Green" },
  ];

  const utilityNav = [
    //{ id: "store", label: "" },
    // 검색: 메인 섹션의 검색 입력을 사용하므로 제거
    { id: "likes", label: "좋아요", go: "likes" as const },
    { id: "my", label: "마이룩북", go: "my" as const },
    { id: "login", label: "로그인 / 회원가입" },
  ];

  const secondaryNav: Array<{
    id: string;
    label: string;
    go?: "home" | "try-on" | "likes" | "my";
  }> = [
    { id: "try-on", label: "버추얼 피팅", go: "try-on" },
    { id: "recommend", label: "추천", go: "home" },
    { id: "ranking", label: "상의" },
    { id: "sale", label: "아우터" },
    { id: "brand", label: "바지" },
    { id: "new", label: "원피스" },
    { id: "fashion", label: "신발" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-30 shadow-sm">
      <div className="bg-[#FEF8E7] text-gray-900">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 sm:px-6 lg:px-8 overflow-x-auto whitespace-nowrap">
          {primaryNav.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => item.go && onNavigate?.(item.go)}
              aria-label={idx === 0 ? "Home" : undefined}
              className={`${idx === 0 ? "flex items-center" : "text-sm font-medium tracking-wide hover:text-gray-700"} transition-colors flex-shrink-0`}
            >
              {idx === 0 ? (
                logoSrc ? (
                  <img
                    src={logoSrc}
                    alt="logo"
                    className="h-6 w-auto object-contain"
                  />
                ) : (
                  <span className="text-lg font-extrabold tracking-tight">
                    MUSINSA
                  </span>
                )
              ) : (
                item.label
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-4 text-xs text-gray-600">
            {utilityNav.map((item) => (
              <button
                key={item.id}
                onClick={() => item.go && onNavigate?.(item.go)}
                className="transition-colors hover:text-gray-900 flex-shrink-0"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-[#ecdcb7] bg-[#FEF8E7] text-gray-900">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center gap-4 px-4 sm:px-6 lg:px-8 text-sm overflow-x-auto whitespace-nowrap">
          <div className="flex items-center gap-4 flex-shrink-0">
            {secondaryNav.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => item.go && onNavigate?.(item.go)}
                className={`border-b-2 border-transparent pb-1 font-medium tracking-tight transition-all hover:border-gray-900/40 hover:text-gray-900 flex-shrink-0 ${idx === 0 ? "border-gray-900 text-gray-900" : ""}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {/* 검색창: 서브 탑 네비의 우측(유틸리티 아래) 배치 */}
          <form
            className="ml-auto flex items-center flex-shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchTerm.trim();
              window.dispatchEvent(
                new CustomEvent("semantic-search", { detail: { q, limit: 24 } })
              );
            }}
            role="search"
            aria-label="상품 검색"
          >
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="검색어를 입력하고 Enter"
              className="h-9 w-48 sm:w-56 md:w-72 rounded-full border border-[#dad0b8] bg-white px-4 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/30"
            />
          </form>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
