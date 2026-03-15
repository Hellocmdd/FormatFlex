import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FilePdfOutlined,
  SwapOutlined,
  PictureOutlined,
  SoundOutlined,
  PlaySquareOutlined,
  ScanOutlined,
  SettingOutlined,
  TranslationOutlined,
  MoonOutlined,
  SunOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';

interface AppLayoutProps {
  children: React.ReactNode;
  darkMode: boolean;
  onToggleDark: (v: boolean) => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, darkMode, onToggleDark }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore storage errors to keep navigation functional.
    }
  }, [sidebarCollapsed]);

  const navItems = [
    { path: '/pdf', navigateTo: '/pdf', icon: <FilePdfOutlined />, label: t('nav.pdf'), color: '#F56776' },
    { path: '/convert', navigateTo: '/convert', icon: <SwapOutlined />, label: t('nav.convert'), color: '#4D84FF' },
    { path: '/image', navigateTo: '/image', icon: <PictureOutlined />, label: t('nav.imageConvert'), color: '#0EA5E9' },
    { path: '/audio', navigateTo: '/audio', icon: <SoundOutlined />, label: t('nav.audioConvert'), color: '#EC4899' },
    { path: '/video', navigateTo: '/video', icon: <PlaySquareOutlined />, label: t('nav.video'), color: '#10B981' },
    { path: '/ocr', navigateTo: '/ocr', icon: <ScanOutlined />, label: t('nav.ocr'), color: '#34C48A' },
    { path: '/settings', navigateTo: '/settings', icon: <SettingOutlined />, label: t('nav.settings'), color: '#F0883E' },
  ];

  const isNavItemActive = (path: string) => {
    if (path !== location.pathname) return false;
    return true;
  };

  const toggleLang = () =>
    i18n.changeLanguage(i18n.language.startsWith('zh') ? 'en' : 'zh');

  return (
    <div className={`app-shell ${darkMode ? 'dark' : 'light'}`}>
      <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          {!sidebarCollapsed && (
            <div className="brand-logo">
              <FilePdfOutlined />
            </div>
          )}
          <div className="brand-text-wrap">
            <div className="brand-name">DocHub</div>
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div
              key={item.navigateTo}
              className={`nav-item ${isNavItemActive(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.navigateTo)}
              style={{ '--item-color': item.color } as React.CSSProperties}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-dot" />
            </div>
          ))}
        </nav>

        {/* Footer controls */}
        <div className="sidebar-footer">
          <button className="ctrl-btn lang-btn" onClick={toggleLang} title={t('nav.toggleLanguage')}>
            <TranslationOutlined />
            <span>{i18n.language.startsWith('zh') ? 'EN' : '中'}</span>
          </button>
          <button
            className={`ctrl-btn theme-btn ${darkMode ? 'active' : ''}`}
            onClick={() => onToggleDark(!darkMode)}
            title={t('nav.toggleDarkMode')}
          >
            {darkMode ? <MoonOutlined /> : <SunOutlined />}
            <span className="theme-label">
              {i18n.language.startsWith('zh') ? (darkMode ? '暗' : '亮') : (darkMode ? 'Dark' : 'Light')}
            </span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
};

export default AppLayout;

