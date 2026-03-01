import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Switch, message, Typography, Space } from 'antd';
import { SettingOutlined, SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface SettingsPageProps {
  darkMode: boolean;
  onToggleDark: (v: boolean) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ darkMode, onToggleDark }) => {
  const { t, i18n } = useTranslation();
  const [baiduAppId, setBaiduAppId] = useState('');
  const [baiduApiKey, setBaiduApiKey] = useState('');
  const [baiduSecretKey, setBaiduSecretKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setBaiduAppId(localStorage.getItem('baidu_app_id') || '');
    setBaiduApiKey(localStorage.getItem('baidu_api_key') || '');
    setBaiduSecretKey(localStorage.getItem('baidu_secret_key') || '');
  }, []);

  const saveOCRConfig = () => {
    localStorage.setItem('baidu_app_id', baiduAppId);
    localStorage.setItem('baidu_api_key', baiduApiKey);
    localStorage.setItem('baidu_secret_key', baiduSecretKey);
    setSaved(true);
    message.success(t('settings.ocr.saved'));
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* General */}
      <Card title={<><SettingOutlined /> {t('settings.title')}</>}>
        <Form layout="vertical">
          <Form.Item label={t('settings.language')}>
            <Select
              value={i18n.language.startsWith('zh') ? 'zh' : 'en'}
              onChange={(v) => i18n.changeLanguage(v)}
              style={{ width: 200 }}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('settings.theme')}>
            <Space>
              <Switch
                checked={darkMode}
                onChange={onToggleDark}
                checkedChildren="🌙"
                unCheckedChildren="☀️"
              />
              <Text>{darkMode ? t('settings.themes.dark') : t('settings.themes.light')}</Text>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* Baidu OCR */}
      <Card title={t('settings.ocr.title')}>
        <Text type="secondary">{t('settings.ocr.hint')}</Text>
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={t('settings.ocr.baiduAppId')}>
            <Input
              value={baiduAppId}
              onChange={(e) => setBaiduAppId(e.target.value)}
              placeholder="App ID"
            />
          </Form.Item>
          <Form.Item label={t('settings.ocr.baiduApiKey')}>
            <Input.Password
              value={baiduApiKey}
              onChange={(e) => setBaiduApiKey(e.target.value)}
              placeholder="API Key"
            />
          </Form.Item>
          <Form.Item label={t('settings.ocr.baiduSecretKey')}>
            <Input.Password
              value={baiduSecretKey}
              onChange={(e) => setBaiduSecretKey(e.target.value)}
              placeholder="Secret Key"
            />
          </Form.Item>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={saveOCRConfig}
            loading={saved}
          >
            {t('settings.ocr.save')}
          </Button>
        </Form>
      </Card>
    </Space>
  );
};

export default SettingsPage;
