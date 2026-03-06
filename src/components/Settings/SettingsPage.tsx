import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Switch, message } from 'antd';
import {
  SettingOutlined, SaveOutlined, TranslationOutlined,
  BgColorsOutlined, KeyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface SettingsPageProps {
  darkMode: boolean;
  onToggleDark: (v: boolean) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ darkMode, onToggleDark }) => {
  const { t, i18n } = useTranslation();
  const [baiduAppId, setBaiduAppId] = useState('');
  const [baiduApiKey, setBaiduApiKey] = useState('');
  const [baiduSecretKey, setBaiduSecretKey] = useState('');
  const [glmApiKey, setGlmApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBaiduAppId(localStorage.getItem('baidu_app_id') || '');
    setBaiduApiKey(localStorage.getItem('baidu_api_key') || '');
    setBaiduSecretKey(localStorage.getItem('baidu_secret_key') || '');
    setGlmApiKey(localStorage.getItem('glm_api_key') || '');
  }, []);

  const saveOCRConfig = () => {
    localStorage.setItem('baidu_app_id', baiduAppId);
    localStorage.setItem('baidu_api_key', baiduApiKey);
    localStorage.setItem('baidu_secret_key', baiduSecretKey);
    localStorage.setItem('glm_api_key', glmApiKey);
    setSaving(true);
    message.success(t('settings.ocr.saved'));
    setTimeout(() => setSaving(false), 1200);
  };

  return (
    <div className="settings-page">
      {/* General */}
      <div className="settings-section">
        <div className="settings-section-hd">
          <div className="settings-section-icon"><SettingOutlined /></div>
          <span className="settings-section-title">{t('settings.title')}</span>
        </div>
        <div className="settings-section-bd">
          <div className="settings-row">
            <div>
              <div className="settings-row-lbl">
                <TranslationOutlined style={{ marginRight: 6 }} />
                {t('settings.language')}
              </div>
            </div>
            <Select
              value={i18n.language.startsWith('zh') ? 'zh' : 'en'}
              onChange={(v) => i18n.changeLanguage(v)}
              style={{ width: 140 }}
              options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-lbl">
                <BgColorsOutlined style={{ marginRight: 6 }} />
                {t('settings.theme')}
              </div>
              <div className="settings-row-sub">
                {darkMode ? t('settings.themes.dark') : t('settings.themes.light')}
              </div>
            </div>
            <Switch
              checked={darkMode}
              onChange={onToggleDark}
              checkedChildren="🌙"
              unCheckedChildren="☀️"
            />
          </div>
        </div>
      </div>

      {/* OCR API Keys */}
      <div className="settings-section">
        <div className="settings-section-hd">
          <div className="settings-section-icon" style={{ background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>
            <KeyOutlined />
          </div>
          <span className="settings-section-title">{t('settings.ocr.title')}</span>
        </div>
        <div className="settings-section-bd" style={{ paddingTop: 14 }}>
          <Form layout="vertical">
            <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--txt-1)', letterSpacing: 0.5 }}>
              百度 OCR
            </div>
            <Form.Item label={t('settings.ocr.baiduAppId')}>
              <Input value={baiduAppId} onChange={(e) => setBaiduAppId(e.target.value)} placeholder="App ID" />
            </Form.Item>
            <Form.Item label={t('settings.ocr.baiduApiKey')}>
              <Input.Password value={baiduApiKey} onChange={(e) => setBaiduApiKey(e.target.value)} placeholder="API Key" />
            </Form.Item>
            <Form.Item label={t('settings.ocr.baiduSecretKey')}>
              <Input.Password value={baiduSecretKey} onChange={(e) => setBaiduSecretKey(e.target.value)} placeholder="Secret Key" />
            </Form.Item>

            <div style={{ marginBottom: 4, marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--txt-1)', letterSpacing: 0.5 }}>
              GLM-OCR (ZhipuAI)
            </div>
            <Form.Item label="API Key">
              <Input.Password value={glmApiKey} onChange={(e) => setGlmApiKey(e.target.value)} placeholder="ZhipuAI API Key" />
            </Form.Item>

            <Button type="primary" icon={<SaveOutlined />} onClick={saveOCRConfig} loading={saving}>
              {t('settings.ocr.save')}
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

