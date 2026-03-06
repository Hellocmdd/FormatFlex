import React, { useState } from 'react';
import {
  Upload, Button, Select, Switch, Input, message,
  Typography, Space, Row, Col, Tabs, Spin,
} from 'antd';
import { ScanOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';

const { Text } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

interface OCRResult extends PyResult {
  text?: string;
  words_count?: number;
  pages?: number;
}

const OCRPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const baiduCreds = () => ({
    app_id: localStorage.getItem('baidu_app_id') || '',
    api_key: localStorage.getItem('baidu_api_key') || '',
    secret_key: localStorage.getItem('baidu_secret_key') || '',
  });

  // ── Single Image OCR ───────────────────────────────
  const SingleOCR = () => {
    const [provider, setProvider] = useState<'local' | 'baidu' | 'glm'>('local');
    const [lang, setLang] = useState('chi_sim+eng');
    const [accurate, setAccurate] = useState(false);
    const [file, setFile] = useState('');

    const handleOCR = async () => {
      if (!file) return message.warning('请选择图片文件');
      setLoading(true); setResult('');
      try {
        let res: OCRResult;
        if (provider === 'baidu') {
          const creds = baiduCreds();
          if (!creds.app_id) return message.error('请先在设置中配置百度 OCR API Key');
          res = await invokeCmd<OCRResult>('ocr_baidu', { image_path: file, ...creds, accurate });
        } else if (provider === 'glm') {
          const apiKey = localStorage.getItem('glm_api_key');
          if (!apiKey) return message.error('请先在设置中配置 GLM API Key');
          res = await invokeCmd<OCRResult>('ocr_glm', { image_path: file, api_key: apiKey });
        } else {
          res = await invokeCmd<OCRResult>('ocr_local', { image_path: file, lang });
        }
        if (res.success) setResult(res.text || '');
        else message.error(res.error);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Row gutter={12}>
          <Col span={8}>
            <Select value={provider} onChange={setProvider} style={{ width: '100%' }}
              options={[
                { value: 'local', label: t('ocr.local') },
                { value: 'baidu', label: t('ocr.baidu') },
                { value: 'glm', label: 'GLM-OCR' },
              ]} />
          </Col>
          {provider === 'local' && (
            <Col span={10}>
              <Select value={lang} onChange={setLang} style={{ width: '100%' }}
                options={Object.entries({
                  'chi_sim+eng': t('ocr.langs.chi_sim+eng'),
                  'chi_sim': t('ocr.langs.chi_sim'),
                  'eng': t('ocr.langs.eng'),
                }).map(([v, l]) => ({ value: v, label: l }))} />
            </Col>
          )}
          {provider === 'baidu' && (
            <Col span={10}>
              <Space>
                <Switch checked={accurate} onChange={setAccurate} />
                <Text>{t('ocr.accurate')}</Text>
              </Space>
            </Col>
          )}
        </Row>
        <Dragger accept=".jpg,.jpeg,.png,.bmp,.tiff,.webp,.gif" maxCount={1}
          beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
          <Text type="secondary">JPG, PNG, BMP, TIFF, WebP</Text>
        </Dragger>
        <Button type="primary" icon={<ScanOutlined />} loading={loading} onClick={handleOCR}>
          {t('common.process')}
        </Button>
      </Space>
    );
  };

  // ── PDF OCR ────────────────────────────────────────
  const PdfOCR = () => {
    const [provider, setProvider] = useState<'local' | 'baidu' | 'glm'>('local');
    const [lang, setLang] = useState('chi_sim+eng');
    const [file, setFile] = useState('');

    const handleOCR = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true); setResult('');
      try {
        const params: Record<string, unknown> = { pdf_path: file, lang, provider };
        if (provider === 'baidu') {
          params.credentials = baiduCreds();
        } else if (provider === 'glm') {
          const apiKey = localStorage.getItem('glm_api_key');
          if (!apiKey) return message.error('请先在设置中配置 GLM API Key');
          params.credentials = { api_key: apiKey };
        }
        const res = await invokeCmd<OCRResult>('ocr_pdf', params);
        if (res.success) { setResult(res.text || ''); message.success(`识别完成，共 ${res.pages} 页`); }
        else message.error(res.error);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Row gutter={12}>
          <Col span={8}>
            <Select value={provider} onChange={setProvider} style={{ width: '100%' }}
              options={[
                { value: 'local', label: t('ocr.local') },
                { value: 'baidu', label: t('ocr.baidu') },
                { value: 'glm', label: 'GLM-OCR' },
              ]} />
          </Col>
          <Col span={10}>
            <Select value={lang} onChange={setLang} style={{ width: '100%' }}
              options={Object.entries({
                'chi_sim+eng': t('ocr.langs.chi_sim+eng'),
                'chi_sim': t('ocr.langs.chi_sim'),
                'eng': t('ocr.langs.eng'),
              }).map(([v, l]) => ({ value: v, label: l }))} />
          </Col>
        </Row>
        <Dragger accept=".pdf" maxCount={1}
          beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Button type="primary" icon={<ScanOutlined />} loading={loading} onClick={handleOCR}>
          {t('ocr.pdfOcr')}
        </Button>
      </Space>
    );
  };

  const copyResult = () =>
    navigator.clipboard.writeText(result).then(() => message.success(t('common.copied')));

  const tabs = [
    { key: 'single', label: t('ocr.title'), children: <SingleOCR /> },
    { key: 'pdf', label: t('ocr.pdfOcr'), children: <PdfOCR /> },
  ];

  return (
    <div className="ocr-page">
      {/* Input panel */}
      <div className="ocr-panel">
        <div className="panel-hd">
          <div className="panel-hd-title">
            <div className="panel-hd-icon" style={{ background: 'rgba(52,196,138,0.12)', color: '#34C48A' }}>
              <ScanOutlined />
            </div>
            {t('ocr.title')}
          </div>
        </div>
        <div className="panel-bd">
          <Tabs items={tabs} />
        </div>
      </div>

      {/* Result panel */}
      <div className="ocr-panel">
        <div className="panel-hd">
          <div className="panel-hd-title">
            <div className="panel-hd-icon" style={{ background: 'rgba(77,132,255,0.12)', color: '#4D84FF' }}>
              <FileTextOutlined />
            </div>
            {t('ocr.result')}
          </div>
          {result && (
            <Button size="small" icon={<CopyOutlined />} onClick={copyResult}>
              {t('common.copy')}
            </Button>
          )}
        </div>
        <div className="panel-bd">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: 'var(--txt-1)', fontSize: 13 }}>{t('common.processing')}</div>
            </div>
          ) : result ? (
            <TextArea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              style={{ fontFamily: 'var(--mono)', minHeight: 400, resize: 'vertical' }}
              autoSize={{ minRows: 16 }}
            />
          ) : (
            <div style={{ color: 'var(--txt-2)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
              {t('ocr.noResult')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OCRPage;

