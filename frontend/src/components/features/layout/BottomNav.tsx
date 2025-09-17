import React from 'react';
import { CategoryIcon } from '../../icons/CategoryIcon';
import { ShirtIcon } from '../../icons/ShirtIcon';
import { HomeIcon } from '../../icons/HomeIcon';
import { HeartIcon } from '../../icons/HeartIcon';
import { UserIcon } from '../../icons/UserIcon';

interface BottomNavProps {
    activePage: string;
    setPage: (page: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activePage, setPage }) => {
    const navItems: Array<{ id: string; label: string; icon: React.FC<any>; page: string | null }> = [
        { id: 'category', label: '카테고리', icon: CategoryIcon, page: null },
        { id: 'try-on', label: '버추얼 피팅', icon: ShirtIcon, page: 'try-on' },
        { id: 'home', label: '홈', icon: HomeIcon, page: 'home' },
        { id: 'likes', label: '좋아요', icon: HeartIcon, page: 'likes' },
        { id: 'my', label: '마이', icon: UserIcon, page: 'my' },
    ];

    return (
        <footer className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-[#2c2c30] bg-[#111111] text-gray-300">
            <nav className="mx-auto flex h-16 max-w-[1280px] items-center justify-around">
                {navItems.map(item => {
                    const isActive = item.page === activePage;
                    return (
                        <button
                            key={item.id}
                            onClick={() => item.page && setPage(item.page)}
                            disabled={!item.page}
                            aria-label={item.label}
                            className={`flex w-1/5 flex-col items-center justify-center gap-1 pt-2 pb-1 text-[11px] transition-colors duration-200 focus:outline-none ${isActive ? 'text-white font-semibold' : 'text-gray-400'} ${!item.page ? 'cursor-not-allowed opacity-40' : 'hover:text-white'}`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} aria-hidden="true" />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </footer>
    );
};
