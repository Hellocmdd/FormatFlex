import React, { useState } from 'react';
import { Upload, Button, Input, message, Typography, Space, Alert } from 'antd';
import {
  SyncOutlined, FileWordOutlined, FileExcelOutlined,
  FilePptOutlined, FileMarkdownOutlined, PictureOutlined,
  Html5Outlined, TableOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';

const { Text } = Typography;
const { Dragger } = Upload;

/* ── Operation definitions ─────────────────────────── */
const OPERATIONS = [
  { key: 'wordToPdf',      icon: <FileWordOutlined />,     color: '#4D84FF',  colorBg: 'rgba(77,132,255,0.12)',   titleKey: 'convert.wordToPdf',      accept: '.docx,.doc',              cmd: 'convert_word_to_pdf',     ext: '.pdf',   libreNote: true  },
  { key: 'excelToPdf',     icon: <FileExcelOutlined />,    color: '#34C48A',  colorBg: 'rgba(52,196,138,0.12)',   titleKey: 'convert.excelToPdf',     accept: '.xlsx,.xls',             cmd: 'convert_excel_to_pdf',    ext: '.pdf',   libreNote: true  },
  { key: 'pptxToPdf',      icon: <FilePptOutlined />,      color: '#F0883E',  colorBg: 'rgba(240,136,62,0.12)',   titleKey: 'convert.pptxToPdf',      accept: '.pptx,.ppt',             cmd: 'convert_pptx_to_pdf',     ext: '.pdf',   libreNote: true  },
  { key: 'pdfToMarkdown',  icon: <FileMarkdownOutlined />, color: '#A78BFA',  colorBg: 'rgba(167,139,250,0.12)', titleKey: 'convert.pdfToMarkdown',  accept: '.pdf',                   cmd: 'convert_pdf_to_markdown', ext: '.md',    libreNote: false },
  { key: 'imagesToPdf',    icon: <PictureOutlined />,      color: '#F56776',  colorBg: 'rgba(245,103,118,0.12)', titleKey: 'convert.imagesToPdf',    accept: '.jpg,.jpeg,.png,.bmp,.tiff,.webp', cmd: '',  ext: '.pdf',   libreNote: false },
  { key: 'htmlToPdf',      icon: <Html5Outlined />,        color: '#22D3EE',  colorBg: 'rgba(34,211,238,0.12)',  titleKey: 'convert.htmlToPdf',      accept: '.html,.htm',             cmd: 'convert_html_to_pdf',     ext: '.pdf',   libreNote: false },
  { key: 'excelToCsv',     icon: <TableOutlined />,        color: '#FBBF24',  colorBg: 'rgba(251,191,36,0.12)',  titleKey: 'convert.excelToCsv',     accept: '.xlsx,.xls',             cmd: 'convert_excel_to_csv',    ext: '(dir)',  libreNote: false },
];

const ConvertPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeOp, setActiveOp] = useState('wordToPdf');

  /* Generic single-file converter */
  const GenericTab = ({ op }: { op: typeof OPERATIONS[0] }) => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');

    const handleConvert = async () => {
      if (!file) return message.warning('请选择文件');
      setLoading(true);
      try {
        const outPath = output || file.replace(/\.[^.]+$/, op.ext === '(dir)' ? '' : op.ext);
        const params = op.key === 'excelToCsv'
          ? { input_file: file, output_dir: outPath }
          : { input_file: file, output_file: outPath };
        const result = await invokeCmd<PyResult>(op.cmd, params);
        if (result.success) message.success(`${t('common.success')}: ${result.output || outPath}`);
        else message.error(`${t('common.error')}: ${result.error}`);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {op.libreNote && (
          <Alert message={t('convert.libreofficeNote')} type="info" showIcon />
        )}
        <Dragger accept={op.accept} maxCount={1}
          beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
          <Text type="secondary">{t('common.supportedFormats')}: {op.accept}</Text>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output}
          onChange={(e) => setOutput(e.target.value)} addonAfter={op.ext} />
        <Button type="primary" icon={<SyncOutlined />} loading={loading} onClick={handleConvert}>
          {t(op.titleKey)}
        </Button>
      </Space>
    );
  };

  /* Images to PDF — multi-file */
  const ImagesToPdfTab = () => {
    const [files, setFiles] = useState<string[]>([]);
    const [output, setOutput] = useState('');

    const handleConvert = async () => {
      if (!files.length) return message.warning('请选择图片文件');
      if (!output) return message.warning('请指定输出路径');
      setLoading(true);
      try {
        const result = await invokeCmd<PyResult>('convert_images_to_pdf', { input_files: files, output_file: output });
        if (result.success) message.success(`${t('common.success')}: ${result.output}`);
        else message.error(result.error);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Dragger multiple accept=".jpg,.jpeg,.png,.bmp,.tiff,.webp"
          beforeUpload={(f) => { setFiles(prev => [...prev, (f as any).path || f.name]); return false; }}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
          <Text type="secondary">JPG, PNG, BMP, TIFF, WebP</Text>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output}
          onChange={(e) => setOutput(e.target.value)} addonAfter=".pdf" />
        <Button type="primary" icon={<SyncOutlined />} loading={loading} onClick={handleConvert}>
          {t('convert.imagesToPdf')}
        </Button>
      </Space>
    );
  };

  const renderContent = () => {
    if (activeOp === 'imagesToPdf') return <ImagesToPdfTab />;
    const op = OPERATIONS.find(o => o.key === activeOp);
    if (!op) return null;
    return <GenericTab op={op} />;
  };

  const currentOp = OPERATIONS.find(o => o.key === activeOp)!;

  return (
    <div className="tool-page">
      {/* Left operation list */}
      <div className="tool-nav">
        <div className="tool-nav-header">
          <SyncOutlined className="tool-nav-icon" />
          格式转换
        </div>
        <div className="tool-nav-list">
          {OPERATIONS.map(op => (
            <div
              key={op.key}
              className={`tool-nav-item ${activeOp === op.key ? 'active' : ''}`}
              onClick={() => setActiveOp(op.key)}
              style={{ '--op-color': op.color } as React.CSSProperties}
            >
              <span className="tni-icon">{op.icon}</span>
              <span>{t(op.titleKey)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right content panel */}
      <div className="tool-panel">
        <div className="tool-panel-header">
          <div
            className="tool-panel-icon"
            style={{ background: currentOp.colorBg, color: currentOp.color }}
          >
            {currentOp.icon}
          </div>
          <div>
            <div className="tool-panel-title">{t(currentOp.titleKey)}</div>
          </div>
        </div>
        <div className="tool-panel-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default ConvertPage;

