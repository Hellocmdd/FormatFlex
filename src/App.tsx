import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';

import AppLayout from './components/Layout/AppLayout';
import PDFPage from './components/PDF/PDFPage';
import ConvertPage from './components/Convert/ConvertPage';
import ImageConvertPage from './components/Image/ImageConvertPage';
import AudioPage from './components/Audio/AudioPage';
import VideoPage from './components/Video/VideoPage';
import OCRPage from './components/OCR/OCRPage';
import SettingsPage from './components/Settings/SettingsPage';

import './App.css';

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(true);
  const { i18n } = useTranslation();

  React.useEffect(() => {
    const root = document.body;
    if (darkMode) {
      root.classList.add('dark-mode');
    } else {
      root.classList.remove('dark-mode');
    }
  }, [darkMode]);

  const locale = i18n.language.startsWith('zh') ? zhCN : enUS;

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: darkMode ? '#4D84FF' : '#2B6DE4',
          borderRadius: 8,
          fontFamily: "'Outfit', -apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif",
          colorBgContainer: darkMode ? '#161D2E' : '#FFFFFF',
          colorBgElevated: darkMode ? '#1C2540' : '#FFFFFF',
          colorBorder: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          colorText: darkMode ? '#E8EDF5' : '#0D1A2D',
          colorTextSecondary: darkMode ? '#7A8BA8' : '#5A6A80',
          colorBgLayout: darkMode ? '#0F1520' : '#F5F8FD',
        },
        components: {
          Menu: {
            activeBarBorderWidth: 0,
            itemSelectedBg: 'var(--accent-bg)',
            itemSelectedColor: 'var(--accent)',
            itemBg: 'transparent',
          },
          Button: { borderRadius: 7, controlHeight: 34 },
          Input:  { controlHeight: 34, borderRadius: 7 },
          Select: { controlHeight: 34, borderRadius: 7 },
          InputNumber: { controlHeight: 34, borderRadius: 7 },
          Tabs: { borderRadius: 7 },
        },
      }}
    >
      <BrowserRouter>
        <AppLayout darkMode={darkMode} onToggleDark={setDarkMode}>
          <Routes>
            <Route path="/" element={<Navigate to="/pdf" replace />} />
            <Route path="/pdf" element={<PDFPage />} />
            <Route path="/convert" element={<ConvertPage />} />
            <Route path="/image" element={<ImageConvertPage />} />
            <Route path="/audio" element={<AudioPage />} />
            <Route path="/video" element={<VideoPage />} />
            <Route path="/ocr" element={<OCRPage />} />
            <Route path="/settings" element={<SettingsPage darkMode={darkMode} onToggleDark={setDarkMode} />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
