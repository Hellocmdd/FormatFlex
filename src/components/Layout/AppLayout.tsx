import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FilePdfOutlined,
  SyncOutlined,
  ScanOutlined,
  SettingOutlined,
  TranslationOutlined,
  MoonOutlined,
  SunOutlined,
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

  const navItems = [
    { path: '/pdf',      icon: <FilePdfOutlined />, label: t('nav.pdf'),      color: '#F56776' },
    { path: '/convert',  icon: <SyncOutlined />,    label: t('nav.convert'),  color: '#4D84FF' },
    { path: '/ocr',      icon: <ScanOutlined />,    label: t('nav.ocr'),      color: '#34C48A' },
    { path: '/settings', icon: <SettingOutlined />, label: t('nav.settings'), color: '#F0883E' },
  ];

  const toggleLang = () =>
    i18n.changeLanguage(i18n.language.startsWith('zh') ? 'en' : 'zh');

  return (
    <div className={`app-shell ${darkMode ? 'dark' : 'light'}`}>
      <aside className="app-sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-logo">
            <FilePdfOutlined />
          </div>
          <div>
            <div className="brand-name">DocHub</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              style={{ '--item-color': item.color } as React.CSSProperties}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-dot" />
            </div>
          ))}
        </nav>

        {/* Footer controls */}
        <div className="sidebar-footer">
          <button className="ctrl-btn" onClick={toggleLang} title="Toggle language">
            <TranslationOutlined />
            <span>{i18n.language.startsWith('zh') ? 'EN' : '中'}</span>
          </button>
          <button
            className={`ctrl-btn ${darkMode ? 'active' : ''}`}
            onClick={() => onToggleDark(!darkMode)}
            title="Toggle dark mode"
          >
            {darkMode ? <MoonOutlined /> : <SunOutlined />}
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

