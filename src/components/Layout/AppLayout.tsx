import React, { useState } from 'react';
import { Layout, Menu, Typography, Switch, Space } from 'antd';
import {
  FilePdfOutlined,
  SyncOutlined,
  ScanOutlined,
  SettingOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Sider, Content, Header } = Layout;
const { Title } = Typography;

interface AppLayoutProps {
  children: React.ReactNode;
  darkMode: boolean;
  onToggleDark: (v: boolean) => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, darkMode, onToggleDark }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { key: '/pdf', icon: <FilePdfOutlined />, label: t('nav.pdf') },
    { key: '/convert', icon: <SyncOutlined />, label: t('nav.convert') },
    { key: '/ocr', icon: <ScanOutlined />, label: t('nav.ocr') },
    { key: '/settings', icon: <SettingOutlined />, label: t('nav.settings') },
  ];

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme={darkMode ? 'dark' : 'light'}
        style={{ borderRight: '1px solid #f0f0f0' }}
      >
        <div style={{ padding: '16px', textAlign: 'center' }}>
          {!collapsed && (
            <Title level={4} style={{ margin: 0, color: darkMode ? '#fff' : '#1677ff' }}>
              DocHub
            </Title>
          )}
        </div>
        <Menu
          theme={darkMode ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: darkMode ? '#141414' : '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: '1px solid #f0f0f0',
            gap: 16,
          }}
        >
          <Space>
            <TranslationOutlined />
            <span
              onClick={toggleLang}
              style={{ cursor: 'pointer', fontWeight: 500 }}
            >
              {i18n.language === 'zh' ? 'EN' : '中文'}
            </span>
            <Switch
              checked={darkMode}
              onChange={onToggleDark}
              checkedChildren="🌙"
              unCheckedChildren="☀️"
            />
          </Space>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>{children}</Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
