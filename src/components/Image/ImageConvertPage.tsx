import React, { useEffect, useState } from 'react';
import { Upload, Button, message, Typography, Space, Alert, Tag, Select } from 'antd';
import { FileImageOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PlayCircleOutlined, SwapOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { invokeCmd, PyResult } from '../../hooks/useInvoke';
import { ensureMultipleLocalPaths, pickMultiplePaths } from '../../utils/filePicker';
import OutputPathInput from '../common/OutputPathInput';

const { Text } = Typography;
const { Dragger } = Upload;

const IMAGE_CONVERT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'ico', 'webp', 'avif'];
const ANY_TO_IMAGES_EXTENSIONS = [
  'arw', 'avif', 'bmp', 'cr2', 'dds', 'dns', 'exr', 'heic', 'ico', 'jfif',
  'jpg', 'jpeg', 'nef', 'png', 'psd', 'raf', 'svg', 'tif', 'tiff', 'tga', 'webp',
  'pdf',
  'doc', 'docx', 'docm', 'dot', 'dotx', 'dotm',
  'odt', 'ott', 'odm',
  'odp', 'otp',
  'ods', 'ots',
  'ppt', 'pptx', 'pptm', 'pot', 'potx', 'potm',
  'xls', 'xlsx', 'xlsm', 'xlt', 'xltx', 'xltm',
];

const OPS = [
  {
    key: 'imageConvert',
    icon: <SwapOutlined />,
    color: '#0EA5E9',
    colorBg: 'rgba(14,165,233,0.12)',
    titleKey: 'convert.imageConvert',
  },
  {
    key: 'anyToImages',
    icon: <FileImageOutlined />,
    color: '#F97316',
    colorBg: 'rgba(249,115,22,0.12)',
    titleKey: 'convert.anyToImages',
  },
] as const;

type OpKey = (typeof OPS)[number]['key'];

const ImageConvertPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [activeOp, setActiveOp] = useState<OpKey>('imageConvert');
  const [loading, setLoading] = useState(false);
  const [toolNavCollapsed, setToolNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem('image_tool_nav_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const [files, setFiles] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState('');
  const [outputFormat, setOutputFormat] = useState('png');
  const [capabilityWarning, setCapabilityWarning] = useState('');

  useEffect(() => {
    const op = searchParams.get('op');
    if (op === 'imageConvert' || op === 'anyToImages') {
      setActiveOp(op);
    }
  }, [searchParams]);

  useEffect(() => {
    invokeCmd<PyResult & { capabilities?: Record<string, boolean> }>('image_supported_formats', {})
      .then((res) => {
        if (!res.success) {
          setCapabilityWarning(t('convert.imageCapabilityUnknown'));
          return;
        }
        const caps = res.capabilities || {};
        const missing: string[] = [];
        if (!caps.rawpy) missing.push('rawpy');
        if (!caps.pillow_heif) missing.push('pillow-heif');
        if (!caps.cairosvg) missing.push('cairosvg');
        if (!caps.psd_tools) missing.push('psd-tools');
        if (!caps.imageio) missing.push('imageio');
        if (activeOp === 'anyToImages' && !caps.libreoffice) missing.push('libreoffice');
        if (missing.length > 0) {
          setCapabilityWarning(`${t('convert.imageCapabilityMissing')}: ${missing.join(', ')}`);
        } else {
          setCapabilityWarning('');
        }
      })
      .catch(() => setCapabilityWarning(t('convert.imageCapabilityUnknown')));
  }, [activeOp, t]);

  useEffect(() => {
    setFiles([]);
    setOutputDir('');
    setOutputFormat('png');
  }, [activeOp]);

  useEffect(() => {
    try {
      localStorage.setItem('image_tool_nav_collapsed', toolNavCollapsed ? '1' : '0');
    } catch {
      // Ignore storage failures and keep UI usable.
    }
  }, [toolNavCollapsed]);

  const accepted = activeOp === 'imageConvert' ? IMAGE_CONVERT_EXTENSIONS : ANY_TO_IMAGES_EXTENSIONS;
  const acceptText = accepted.map((ext) => `.${ext}`).join(',');
  const outputOptions = activeOp === 'imageConvert'
    ? ['png', 'jpg', 'jpeg', 'ico', 'webp', 'avif']
    : ['png', 'jpg', 'webp'];

  const currentOp = OPS.find((v) => v.key === activeOp)!;
  const fileBaseName = (path: string) => path.split('/').pop() || path;

  const handleConvert = async () => {
    if (!files.length) return message.warning(t('convert.imageNeedFiles'));
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        input_files: files,
        output_format: outputFormat,
      };
      if (outputDir.trim()) params.output_dir = outputDir.trim();
      if (activeOp === 'anyToImages') params.dpi = 200;

      const cmd = activeOp === 'imageConvert' ? 'image_convert' : 'any_to_images';
      const result = await invokeCmd<PyResult>(cmd, params);

      if (result.success) {
        const outCount = result.outputs?.length || 0;
        message.success(`${t('common.success')}: ${outCount}`);
        if (result.warnings?.length) {
          message.warning(result.warnings.join(' | '));
        }
      } else {
        message.error(`${t('common.error')}: ${result.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-page">
      <div className={`tool-nav ${toolNavCollapsed ? 'collapsed' : ''}`}>
        <div className="tool-nav-header">
          <SwapOutlined className="tool-nav-icon" />
          <span className="tool-nav-head-title">{t('nav.imageConvert')}</span>
          <button
            className="tool-nav-collapse-btn"
            onClick={() => setToolNavCollapsed(v => !v)}
            title={toolNavCollapsed ? t('nav.expandToolNav') : t('nav.collapseToolNav')}
            aria-label={toolNavCollapsed ? t('nav.expandToolNav') : t('nav.collapseToolNav')}
          >
            {toolNavCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>
        <div className="tool-nav-list">
          {OPS.map((op) => (
            <div
              key={op.key}
              className={`tool-nav-item ${activeOp === op.key ? 'active' : ''}`}
              onClick={() => setActiveOp(op.key)}
              style={{ '--op-color': op.color } as React.CSSProperties}
              title={t(op.titleKey)}
            >
              <span className="tni-icon">{op.icon}</span>
              <span className="tni-label">{t(op.titleKey)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tool-panel">
        <div className="tool-panel-header">
          <div className="tool-panel-icon" style={{ background: currentOp.colorBg, color: currentOp.color }}>
            {currentOp.icon}
          </div>
          <div>
            <div className="tool-panel-title">{t(currentOp.titleKey)}</div>
          </div>
        </div>

        <div className="tool-panel-body">
          <Space direction="vertical" style={{ width: '100%' }}>
            {activeOp === 'anyToImages' && (
              <Alert message={t('convert.anyToImagesDefault')} type="info" showIcon />
            )}
            {capabilityWarning && (
              <Alert message={capabilityWarning} type="warning" showIcon />
            )}

            <div className="pdf-file-block">
              <div onClick={async () => {
                const picked = await pickMultiplePaths({
                  title: t('common.selectFiles'),
                  filters: [{ name: 'files', extensions: accepted }],
                });
                if (!picked.length) return;
                setFiles((prev) => [...prev, ...picked]);
                message.success(`${t('common.success')}: +${picked.length}`);
              }}>
                <Dragger
                  multiple
                  accept={acceptText}
                  openFileDialogOnClick={false}
                  beforeUpload={async (f) => {
                    const paths = await ensureMultipleLocalPaths(f, {
                      title: t('common.selectFiles'),
                      filters: [{ name: 'files', extensions: accepted }],
                    });
                    if (!paths.length) {
                      message.error(t('common.filePathUnavailable'));
                      return Upload.LIST_IGNORE;
                    }
                    setFiles((prev) => [...prev, ...paths]);
                    return false;
                  }}
                >
                  <p className="ant-upload-hint">{t('common.dragHint')}</p>
                  <Text type="secondary">{t('common.supportedFormats')}: {acceptText}</Text>
                </Dragger>
              </div>

              <div className="pdf-file-selected-slot">
                {files.length > 0 && (
                  <Space wrap>
                    {files.map((f, i) => (
                      <Tag key={`${f}-${i}`} closable onClose={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                        {fileBaseName(f)}
                      </Tag>
                    ))}
                  </Space>
                )}
              </div>
            </div>

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('convert.imageOutputFormat')}</Text>
              <Select
                value={outputFormat}
                onChange={(v) => setOutputFormat(v)}
                style={{ minWidth: 180 }}
                options={outputOptions.map((v) => ({ label: v.toUpperCase(), value: v }))}
              />
            </Space>

            <OutputPathInput value={outputDir} onChange={setOutputDir} mode="dir" />

            <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleConvert}>
              {t(currentOp.titleKey)}
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );
};

export default ImageConvertPage;
