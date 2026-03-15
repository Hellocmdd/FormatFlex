import React, { useState, useEffect } from 'react';
import { Alert, Form, Input, Select, Button, Switch, message } from 'antd';
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
  const [glmApiKey, setGlmApiKey] = useState('');
  const [jooxUuid, setJooxUuid] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    localStorage.removeItem('baidu_app_id');
    localStorage.removeItem('baidu_api_key');
    localStorage.removeItem('baidu_secret_key');
    setGlmApiKey(localStorage.getItem('glm_api_key') || '');
    setJooxUuid(localStorage.getItem('joox_uuid') || '');
  }, []);

  const saveOCRConfig = () => {
    localStorage.removeItem('baidu_app_id');
    localStorage.removeItem('baidu_api_key');
    localStorage.removeItem('baidu_secret_key');
    localStorage.setItem('glm_api_key', glmApiKey);
    localStorage.setItem('joox_uuid', jooxUuid.trim());
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
              GLM-OCR (ZhipuAI)
            </div>
            <Alert
              message={glmApiKey.trim() ? t('settings.ocr.glmConfigured') : t('settings.ocr.glmMissing')}
              description={t('settings.ocr.glmNoticeDescription')}
              type={glmApiKey.trim() ? 'info' : 'warning'}
              showIcon
              banner
              style={{ marginBottom: 12 }}
            />
            <Form.Item label="API Key">
              <Input.Password value={glmApiKey} onChange={(e) => setGlmApiKey(e.target.value)} placeholder="ZhipuAI API Key" />
            </Form.Item>

            <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--txt-1)', letterSpacing: 0.5 }}>
              JOOX
            </div>
            <Form.Item label={t('settings.ocr.jooxUuid')}>
              <Input value={jooxUuid} onChange={(e) => setJooxUuid(e.target.value)} placeholder={t('settings.ocr.jooxUuidPlaceholder')} />
            </Form.Item>
            <div style={{ marginTop: -10, marginBottom: 12, fontSize: 12, color: 'var(--txt-2)' }}>
              {t('settings.ocr.jooxUsage')}
            </div>

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

