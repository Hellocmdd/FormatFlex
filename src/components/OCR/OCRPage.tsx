import React, { useState } from 'react';
import {
  Alert, Upload, Button, Select, Input, message, Tag, Segmented,
  Typography, Space, Row, Col, Spin,
} from 'antd';
import { CopyOutlined, FileSearchOutlined, ReadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';
import { ensureSingleLocalPath, pickSinglePath } from '../../utils/filePicker';

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [isGlmResult, setIsGlmResult] = useState(false);
  const [glmViewMode, setGlmViewMode] = useState<'rendered' | 'source'>('rendered');

  const fileBaseName = (path: string) => path.split('/').pop() || path;
  const SelectedFileTag = ({ path }: { path: string }) => (
    path ? <Tag className="pdf-selected-file">{t('common.selectedFile')}: {fileBaseName(path)}</Tag> : null
  );

  const [provider, setProvider] = useState<'local' | 'glm'>('local');
  const [lang, setLang] = useState('chi_sim+eng');
  const [file, setFile] = useState('');
  const hasGlmKey = !!localStorage.getItem('glm_api_key')?.trim();

  const handleOCR = async () => {
    if (!file) return message.warning('请选择要识别的文件（图片或 PDF）');
    setLoading(true);
    setResult('');
    setIsGlmResult(false);
    setGlmViewMode('rendered');

    try {
      const params: Record<string, unknown> = {
        input_path: file,
        provider,
        lang,
      };

      if (provider === 'glm') {
        const apiKey = localStorage.getItem('glm_api_key');
        if (!apiKey) return message.error('请先在设置中配置 GLM API Key');
        params.credentials = { api_key: apiKey };
      }

      const res = await invokeCmd<OCRResult>('ocr_auto', params);
      if (!res.success) {
        message.error(res.error);
        return;
      }

      setResult(res.text || '');
      const glmMode = provider === 'glm';
      setIsGlmResult(glmMode);
      setGlmViewMode(glmMode ? 'rendered' : 'source');
      if (res.pages) {
        message.success(`识别完成，共 ${res.pages} 页`);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyResult = () =>
    navigator.clipboard.writeText(result).then(() => message.success(t('common.copied')));

  return (
    <div className="ocr-page">
      {/* Input panel */}
      <div className="ocr-panel">
        <div className="panel-hd">
          <div className="panel-hd-title">
            <div className="panel-hd-icon" style={{ background: 'rgba(52,196,138,0.12)', color: '#34C48A' }}>
              <FileSearchOutlined />
            </div>
            {t('ocr.title')}
          </div>
        </div>
        <div className="panel-bd">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Row gutter={12}>
              <Col span={12}>
                <Select value={provider} onChange={setProvider} style={{ width: '100%' }}
                  options={[
                    { value: 'local', label: t('ocr.local') },
                    { value: 'glm', label: 'GLM-OCR' },
                  ]} />
              </Col>
              <Col span={12}>
                <Select value={lang} onChange={setLang} style={{ width: '100%' }}
                  options={Object.entries({
                    'chi_sim+eng': t('ocr.langs.chi_sim+eng'),
                    'chi_sim': t('ocr.langs.chi_sim'),
                    'eng': t('ocr.langs.eng'),
                  }).map(([v, l]) => ({ value: v, label: l }))} />
              </Col>
            </Row>

            {provider === 'glm' && (
              <Alert
                message={hasGlmKey ? t('ocr.glmNoticeReady') : t('ocr.glmNoticeMissing')}
                description={t('ocr.glmNoticeDescription')}
                type={hasGlmKey ? 'info' : 'warning'}
                showIcon
                banner
                action={
                  <Button size="small" onClick={() => navigate('/settings')}>
                    {t('ocr.openSettings')}
                  </Button>
                }
              />
            )}

            <div className="pdf-file-block">
              <div onClick={async () => {
                  const picked = await pickSinglePath({
                    title: t('common.selectFile'),
                    filters: [{ name: 'ocr', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp', 'gif', 'pdf'] }],
                  });
                  if (!picked) return;
                  setFile(picked);
                  message.success(`${t('common.success')}: ${picked}`);
                }}>
                <Dragger accept=".jpg,.jpeg,.png,.bmp,.tiff,.webp,.gif,.pdf" maxCount={1} openFileDialogOnClick={false}
                  beforeUpload={async (f) => {
                    const p = await ensureSingleLocalPath(f, {
                      title: t('common.selectFile'),
                      filters: [{ name: 'ocr', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp', 'gif', 'pdf'] }],
                    });
                    if (!p) {
                      message.error(t('common.filePathUnavailable'));
                      return Upload.LIST_IGNORE;
                    }
                    setFile(p);
                    return false;
                  }}>
                  <p className="ant-upload-hint">{t('common.dragHint')}</p>
                  <Text type="secondary">JPG, PNG, BMP, TIFF, WebP, PDF</Text>
                </Dragger>
              </div>
              <div className="pdf-file-selected-slot">
                <SelectedFileTag path={file} />
              </div>
            </div>

            <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleOCR}>
              {t('common.process')}
            </Button>
          </Space>
        </div>
      </div>

      {/* Result panel */}
      <div className="ocr-panel">
        <div className="panel-hd">
          <div className="panel-hd-title">
            <div className="panel-hd-icon" style={{ background: 'rgba(77,132,255,0.12)', color: '#4D84FF' }}>
              <ReadOutlined />
            </div>
            {t('ocr.result')}
          </div>
          <Space>
            {result && isGlmResult && (
              <Segmented
                size="small"
                value={glmViewMode}
                onChange={(v) => setGlmViewMode(v as 'rendered' | 'source')}
                options={[
                  { label: t('ocr.renderedView'), value: 'rendered' },
                  { label: t('ocr.sourceView'), value: 'source' },
                ]}
              />
            )}
            {result && (
              <Button size="small" icon={<CopyOutlined />} onClick={copyResult}>
                {t('common.copy')}
              </Button>
            )}
          </Space>
        </div>
        <div className="panel-bd">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: 'var(--txt-1)', fontSize: 13 }}>{t('common.processing')}</div>
            </div>
          ) : result ? (
            isGlmResult && glmViewMode === 'rendered' ? (
              <div className="ocr-markdown-preview">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeRaw]}
                >
                  {result}
                </ReactMarkdown>
              </div>
            ) : (
              <TextArea
                value={result}
                onChange={(e) => setResult(e.target.value)}
                style={{ fontFamily: 'var(--mono)', minHeight: 400, resize: 'vertical' }}
                autoSize={{ minRows: 16 }}
              />
            )
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

