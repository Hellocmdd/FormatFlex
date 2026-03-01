import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';

import AppLayout from './components/Layout/AppLayout';
import PDFPage from './components/PDF/PDFPage';
import ConvertPage from './components/Convert/ConvertPage';
import OCRPage from './components/OCR/OCRPage';
import SettingsPage from './components/Settings/SettingsPage';

import './App.css';

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const { i18n } = useTranslation();

  const locale = i18n.language.startsWith('zh') ? zhCN : enUS;

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#1677ff' },
      }}
    >
      <BrowserRouter>
        <AppLayout darkMode={darkMode} onToggleDark={setDarkMode}>
          <Routes>
            <Route path="/" element={<Navigate to="/pdf" replace />} />
            <Route path="/pdf" element={<PDFPage />} />
            <Route path="/convert" element={<ConvertPage />} />
            <Route path="/ocr" element={<OCRPage />} />
            <Route path="/settings" element={<SettingsPage darkMode={darkMode} onToggleDark={setDarkMode} />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
