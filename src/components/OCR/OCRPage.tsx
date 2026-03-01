import React, { useState } from 'react';
import {
  Card, Upload, Button, Select, Switch, Input, message,
  Typography, Space, Row, Col, Tabs, Spin,
} from 'antd';
import { ScanOutlined, CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';

const { Title, Text } = Typography;
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

  // ── Single Image OCR ───────────────────────────────────────────────────────
  const SingleOCR = () => {
    const [provider, setProvider] = useState<'local' | 'baidu'>('local');
    const [lang, setLang] = useState('chi_sim+eng');
    const [accurate, setAccurate] = useState(false);
    const [file, setFile] = useState('');

    const handleOCR = async () => {
      if (!file) return message.warning('请选择图片文件');
      setLoading(true);
      setResult('');
      try {
        let res: OCRResult;
        if (provider === 'baidu') {
          const creds = baiduCreds();
          if (!creds.app_id) return message.error('请先在设置中配置百度 OCR API Key');
          res = await invokeCmd<OCRResult>('ocr_baidu', {
            image_path: file, ...creds, accurate,
          });
        } else {
          res = await invokeCmd<OCRResult>('ocr_local', { image_path: file, lang });
        }
        if (res.success) {
          setResult(res.text || '');
        } else {
          message.error(res.error);
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Row gutter={16}>
          <Col span={8}>
            <Select
              value={provider}
              onChange={setProvider}
              style={{ width: '100%' }}
              options={[
                { value: 'local', label: t('ocr.local') },
                { value: 'baidu', label: t('ocr.baidu') },
              ]}
            />
          </Col>
          {provider === 'local' && (
            <Col span={8}>
              <Select
                value={lang}
                onChange={setLang}
                style={{ width: '100%' }}
                options={Object.entries({ 'chi_sim+eng': t('ocr.langs.chi_sim+eng'), 'chi_sim': t('ocr.langs.chi_sim'), 'eng': t('ocr.langs.eng') })
                  .map(([v, l]) => ({ value: v, label: l }))}
              />
            </Col>
          )}
          {provider === 'baidu' && (
            <Col span={12}>
              <Space>
                <Switch checked={accurate} onChange={setAccurate} />
                <Text>{t('ocr.accurate')}</Text>
              </Space>
            </Col>
          )}
        </Row>
        <Dragger
          accept=".jpg,.jpeg,.png,.bmp,.tiff,.webp,.gif"
          maxCount={1}
          beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }}
        >
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
          <Text type="secondary">JPG, PNG, BMP, TIFF, WebP</Text>
        </Dragger>
        <Button type="primary" icon={<ScanOutlined />} loading={loading} onClick={handleOCR}>
          {t('common.process')}
        </Button>
      </Space>
    );
  };

  // ── PDF OCR ────────────────────────────────────────────────────────────────
  const PdfOCR = () => {
    const [provider, setProvider] = useState<'local' | 'baidu'>('local');
    const [lang, setLang] = useState('chi_sim+eng');
    const [file, setFile] = useState('');

    const handleOCR = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true);
      setResult('');
      try {
        const params: Record<string, unknown> = { pdf_path: file, lang, provider };
        if (provider === 'baidu') {
          params.credentials = baiduCreds();
        }
        const res = await invokeCmd<OCRResult>('ocr_pdf', params);
        if (res.success) {
          setResult(res.text || '');
          message.success(`识别完成，共 ${res.pages} 页`);
        } else {
          message.error(res.error);
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Row gutter={16}>
          <Col span={8}>
            <Select value={provider} onChange={setProvider} style={{ width: '100%' }}
              options={[{ value: 'local', label: t('ocr.local') }, { value: 'baidu', label: t('ocr.baidu') }]}
            />
          </Col>
          <Col span={8}>
            <Select value={lang} onChange={setLang} style={{ width: '100%' }}
              options={Object.entries({ 'chi_sim+eng': t('ocr.langs.chi_sim+eng'), 'chi_sim': t('ocr.langs.chi_sim'), 'eng': t('ocr.langs.eng') })
                .map(([v, l]) => ({ value: v, label: l }))}
            />
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

  const copyResult = () => {
    navigator.clipboard.writeText(result).then(() => message.success(t('common.copied')));
  };

  const tabs = [
    { key: 'single', label: t('ocr.title'), children: <SingleOCR /> },
    { key: 'pdf', label: t('ocr.pdfOcr'), children: <PdfOCR /> },
  ];

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Card>
          <Title level={4}><ScanOutlined /> {t('ocr.title')}</Title>
          <Tabs items={tabs} />
        </Card>
      </Col>
      <Col span={12}>
        <Card
          title={t('ocr.result')}
          extra={result && (
            <Button size="small" icon={<CopyOutlined />} onClick={copyResult}>
              {t('common.copy')}
            </Button>
          )}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>{t('common.processing')}</div>
            </div>
          ) : result ? (
            <TextArea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              rows={20}
              style={{ fontFamily: 'monospace' }}
            />
          ) : (
            <Text type="secondary">{t('ocr.noResult')}</Text>
          )}
        </Card>
      </Col>
    </Row>
  );
};

export default OCRPage;
