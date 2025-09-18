import { useState, useEffect } from 'react';
import { VirtualTryOnUI, ECommerceUI, LikesPage, MyPage } from './components/features';
import { TopBar } from './components/features/layout/TopBar';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';

function App() {
  const PAGE_KEY = 'app:currentPage:v1';
  const allowed = new Set(['home', 'try-on', 'likes', 'my']);
  const getInitial = (): string => {
    const fromHash = (window.location.hash || '').replace(/^#/, '');
    const fromStorage = localStorage.getItem(PAGE_KEY) || '';
    if (allowed.has(fromHash)) return fromHash;
    if (allowed.has(fromStorage)) return fromStorage;
    return 'home';
  };

  const [currentPage, setCurrentPage] = useState<string>(getInitial);

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_KEY, currentPage);
    } catch {
      /* ignore */
    }
    if ((window.location.hash || '').replace(/^#/, '') !== currentPage) {
      window.location.hash = currentPage;
    }
  }, [currentPage]);

  useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || '').replace(/^#/, '');
      if (allowed.has(h)) {
        setCurrentPage(h);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'try-on':
        return <VirtualTryOnUI />;
      case 'home':
        return <ECommerceUI onNavigate={(p) => setCurrentPage(p)} />;
      case 'likes':
        return <LikesPage />;
      case 'my':
        return <MyPage />;
      default:
        return <VirtualTryOnUI />;
    }
  };

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-base)]">
          <TopBar onNavigate={(p) => setCurrentPage(p)} />
          {renderCurrentPage()}
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
