import React, { useEffect, useState } from 'react';
import { Upload, Button, message, Typography, Space, Alert, Tag, Switch, InputNumber, Select } from 'antd';
import {
  SwapOutlined, PlayCircleOutlined, FileWordOutlined, FileExcelOutlined,
  FilePptOutlined, FileMarkdownOutlined, PictureOutlined,
  Html5Outlined, TableOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';
import {
  ensureMultipleLocalPaths,
  ensureSingleLocalPath,
  pickMultiplePaths,
  pickSinglePath,
} from '../../utils/filePicker';
import OutputPathInput from '../common/OutputPathInput';

const { Text } = Typography;
const { Dragger } = Upload;

/* ── Operation definitions ─────────────────────────── */
const OPERATIONS = [
  { key: 'wordToPdf',      icon: <FileWordOutlined />,     color: '#4D84FF',  colorBg: 'rgba(77,132,255,0.12)',   titleKey: 'convert.wordToPdf',      accept: '.doc,.docx,.odt',       cmd: 'convert_word_to_pdf',     ext: '.pdf',   libreNote: true  },
  { key: 'excelToPdf',     icon: <FileExcelOutlined />,    color: '#34C48A',  colorBg: 'rgba(52,196,138,0.12)',   titleKey: 'convert.excelToPdf',     accept: '.xls,.xlsx,.ods',       cmd: 'convert_excel_to_pdf',    ext: '.pdf',   libreNote: true  },
  { key: 'pptxToPdf',      icon: <FilePptOutlined />,      color: '#F0883E',  colorBg: 'rgba(240,136,62,0.12)',   titleKey: 'convert.pptxToPdf',      accept: '.ppt,.pptx,.odp',       cmd: 'convert_pptx_to_pdf',     ext: '.pdf',   libreNote: true  },
  { key: 'wordToMarkdown', icon: <FileMarkdownOutlined />, color: '#22C55E',  colorBg: 'rgba(34,197,94,0.12)',    titleKey: 'convert.wordToMarkdown', accept: '.doc,.docx,.odt',         cmd: 'convert_word_to_markdown', ext: '.md',    libreNote: true  },
  { key: 'pdfToWord',      icon: <FileWordOutlined />,     color: '#34C48A',  colorBg: 'rgba(52,196,138,0.12)',   titleKey: 'convert.pdfToWord',      accept: '.pdf',                   cmd: 'pdf_to_docx',             ext: '.docx',  libreNote: false },
  { key: 'pdfToMarkdown',  icon: <FileMarkdownOutlined />, color: '#A78BFA',  colorBg: 'rgba(167,139,250,0.12)', titleKey: 'convert.pdfToMarkdown',  accept: '.pdf',                   cmd: 'convert_pdf_to_markdown', ext: '.md',    libreNote: false },
  { key: 'imagesToPdf',    icon: <PictureOutlined />,      color: '#F56776',  colorBg: 'rgba(245,103,118,0.12)', titleKey: 'convert.imagesToPdf',    accept: '.jpg,.jpeg,.png,.bmp,.tiff,.webp', cmd: '',  ext: '.pdf',   libreNote: true  },
  { key: 'htmlToPdf',      icon: <Html5Outlined />,        color: '#22D3EE',  colorBg: 'rgba(34,211,238,0.12)',  titleKey: 'convert.htmlToPdf',      accept: '.html,.htm',             cmd: 'convert_html_to_pdf',     ext: '.pdf',   libreNote: true  },
  { key: 'markdownToPdf',  icon: <FileMarkdownOutlined />, color: '#7DD3FC',  colorBg: 'rgba(125,211,252,0.14)', titleKey: 'convert.markdownToPdf',  accept: '.md,.markdown',          cmd: 'convert_markdown_to_pdf', ext: '.pdf',   libreNote: true  },
  { key: 'markdownToExcel',icon: <TableOutlined />,        color: '#14B8A6',  colorBg: 'rgba(20,184,166,0.12)',  titleKey: 'convert.markdownToExcel',accept: '.md,.markdown',          cmd: 'convert_markdown_to_excel', ext: '.xlsx', libreNote: false },
  { key: 'pdfToExcel',     icon: <TableOutlined />,        color: '#F59E0B',  colorBg: 'rgba(245,158,11,0.12)',  titleKey: 'convert.pdfToExcel',     accept: '.pdf',                   cmd: 'convert_pdf_to_excel',    ext: '.xlsx', libreNote: false },
  { key: 'excelToCsv',     icon: <TableOutlined />,        color: '#FBBF24',  colorBg: 'rgba(251,191,36,0.12)',  titleKey: 'convert.excelToCsv',     accept: '.xlsx,.xlsm,.xltx,.xltm,.xls,.ods', cmd: 'convert_excel_to_csv',    ext: '(dir)',  libreNote: false },
  { key: 'excelToMarkdown',icon: <FileMarkdownOutlined />, color: '#0EA5E9',  colorBg: 'rgba(14,165,233,0.12)',  titleKey: 'convert.excelToMarkdown',accept: '.xlsx,.xlsm,.xltx,.xltm,.xls,.ods', cmd: 'convert_excel_to_markdown', ext: '(dir)', libreNote: false },
];

const ConvertPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [activeOp, setActiveOp] = useState('wordToPdf');
  const [toolNavCollapsed, setToolNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem('convert_tool_nav_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const fileBaseName = (path: string) => path.split('/').pop() || path;

  useEffect(() => {
    try {
      localStorage.setItem('convert_tool_nav_collapsed', toolNavCollapsed ? '1' : '0');
    } catch {
      // Ignore storage failures and keep UI usable.
    }
  }, [toolNavCollapsed]);

  useEffect(() => {
    const op = searchParams.get('op');
    if (!op) return;
    if (op === 'imageConvert' || op === 'anyToImages') {
      navigate(`/image?op=${op}`, { replace: true });
      return;
    }
    if (op === 'audioConvert') {
      navigate('/audio', { replace: true });
      return;
    }
    if (OPERATIONS.some((item) => item.key === op)) {
      setActiveOp(op);
    }
  }, [navigate, searchParams]);

  const SelectedFileTag = ({ path }: { path: string }) => (
    path ? <Tag className="pdf-selected-file">{t('common.selectedFile')}: {fileBaseName(path)}</Tag> : null
  );

  const renderGlmNotice = (message: string, hasGlmKey: boolean) => (
    <Alert
      message={message}
      description={t('convert.glmCloudNotice')}
      type={hasGlmKey ? 'info' : 'warning'}
      showIcon
      banner
      action={
        <Button size="small" onClick={() => navigate('/settings')}>
          {t('convert.glmOpenSettings')}
        </Button>
      }
    />
  );

  /* Generic single-file converter */
  const GenericTab = ({ op }: { op: typeof OPERATIONS[0] }) => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [extractImages, setExtractImages] = useState(true);
    const [pdfMarkdownMode, setPdfMarkdownMode] = useState<'auto' | 'local' | 'glm'>('auto');
    const [pdfMarkdownResult, setPdfMarkdownResult] = useState<PyResult | null>(null);
    const [pdfWordMode, setPdfWordMode] = useState<'auto' | 'local' | 'glm'>('local');
    const [pdfWordAdvanced, setPdfWordAdvanced] = useState(false);
    const [pdfWordIgnorePageError, setPdfWordIgnorePageError] = useState(true);
    const [pdfWordMultiProcessing, setPdfWordMultiProcessing] = useState(false);
    const [pdfWordCpuCount, setPdfWordCpuCount] = useState<number>(0);
    const [pdfWordParseLatticeTable, setPdfWordParseLatticeTable] = useState(true);
    const [pdfWordParseStreamTable, setPdfWordParseStreamTable] = useState(true);
    const [pdfWordDeleteLineHyphen, setPdfWordDeleteLineHyphen] = useState(false);
    const hasGlmKey = !!localStorage.getItem('glm_api_key')?.trim();
    const usesOutputDir = op.key === 'excelToCsv' || op.key === 'excelToMarkdown';

    const handleConvert = async () => {
      if (!file) return message.warning('请选择文件');
      setLoading(true);
      try {
        setPdfMarkdownResult(null);
        const params: Record<string, unknown> = { input_file: file };
        if (op.key === 'pdfToMarkdown' || op.key === 'wordToMarkdown') {
          params.provider = op.key === 'pdfToMarkdown' ? pdfMarkdownMode : 'auto';
          const apiKey = localStorage.getItem('glm_api_key');
          if (apiKey && (op.key !== 'pdfToMarkdown' || pdfMarkdownMode !== 'local')) {
            params.credentials = { api_key: apiKey };
          }
        }
        if (op.key === 'wordToMarkdown' || op.key === 'pdfToMarkdown') {
          params.extract_images = extractImages;
        }
        if (op.key === 'pdfToWord') {
          params.provider = pdfWordMode;
          params.lang = 'chi_sim+eng';
          const apiKey = localStorage.getItem('glm_api_key');
          if (apiKey && pdfWordMode !== 'local') {
            params.credentials = { api_key: apiKey };
          }
          params.ignore_page_error = pdfWordIgnorePageError;
          params.multi_processing = pdfWordMultiProcessing;
          params.cpu_count = pdfWordMultiProcessing ? Number(pdfWordCpuCount || 0) : 0;
          params.parse_lattice_table = pdfWordParseLatticeTable;
          params.parse_stream_table = pdfWordParseStreamTable;
          params.delete_end_line_hyphen = pdfWordDeleteLineHyphen;
          params.raw_exceptions = false;
        }
        if (output.trim()) {
          if (op.key === 'excelToCsv' || op.key === 'excelToMarkdown') params.output_dir = output.trim();
          else params.output_file = output.trim();
        }
        const result = await invokeCmd<PyResult>(op.cmd, params);
        if (op.key === 'pdfToMarkdown') {
          setPdfMarkdownResult(result);
        }
        if (result.success) {
          const first = result.outputs?.[0];
          const resolvedPath = result.output || (first ? first.substring(0, first.lastIndexOf('/')) : output);
          message.success(`${t('common.success')}: ${resolvedPath}`);
        }
        else message.error(`${t('common.error')}: ${result.error}`);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {op.libreNote && (
          <Alert message={t('convert.libreofficeNote')} type="info" showIcon />
        )}
        {op.key === 'wordToMarkdown' && renderGlmNotice(
          hasGlmKey ? t('convert.wordToMarkdownUsesGlm') : t('convert.wordToMarkdownFallbackLocal'),
          hasGlmKey,
        )}
        {op.key === 'pdfToMarkdown' && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {renderGlmNotice(
              hasGlmKey ? t('convert.pdfToMarkdownUsesGlm') : t('convert.pdfToMarkdownFallbackLocal'),
              hasGlmKey,
            )}
            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('convert.pdfToMarkdownMode')}</Text>
              <Select
                value={pdfMarkdownMode}
                onChange={(v) => setPdfMarkdownMode(v)}
                style={{ minWidth: 220 }}
                options={[
                  { value: 'auto', label: t('convert.pdfToMarkdownModeAuto') },
                  { value: 'local', label: t('convert.pdfToMarkdownModeLocal') },
                  { value: 'glm', label: t('convert.pdfToMarkdownModeGlm') },
                ]}
              />
            </Space>
          </Space>
        )}
        {(op.key === 'wordToMarkdown' || op.key === 'pdfToMarkdown') && (
          <Space>
            <Text>{t('convert.markdownExtractImages')}</Text>
            <Switch checked={extractImages} onChange={setExtractImages} />
          </Space>
        )}
        {op.key === 'pdfToWord' && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {renderGlmNotice(
              hasGlmKey ? t('convert.pdfToWordUsesGlm') : t('convert.pdfToWordFallbackLocal'),
              hasGlmKey,
            )}
            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('convert.pdfToWordMode')}</Text>
              <Select
                value={pdfWordMode}
                onChange={(v) => setPdfWordMode(v)}
                style={{ minWidth: 220 }}
                options={[
                  { value: 'auto', label: t('convert.pdfToWordModeAuto') },
                  { value: 'local', label: t('convert.pdfToWordModeLocal') },
                  { value: 'glm', label: t('convert.pdfToWordModeGlm') },
                ]}
              />
            </Space>
            <Space>
              <Text>{t('convert.pdfToWordAdvanced')}</Text>
              <Switch checked={pdfWordAdvanced} onChange={setPdfWordAdvanced} />
            </Space>
            {pdfWordAdvanced && (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Text>{t('convert.pdfToWordIgnorePageError')}</Text>
                  <Switch checked={pdfWordIgnorePageError} onChange={setPdfWordIgnorePageError} />
                </Space>
                <Space>
                  <Text>{t('convert.pdfToWordMultiProcessing')}</Text>
                  <Switch checked={pdfWordMultiProcessing} onChange={setPdfWordMultiProcessing} />
                </Space>
                <Space>
                  <Text>{t('convert.pdfToWordCpuCount')}</Text>
                  <InputNumber
                    min={0}
                    max={64}
                    value={pdfWordCpuCount}
                    onChange={(val) => setPdfWordCpuCount(Number(val || 0))}
                    disabled={!pdfWordMultiProcessing}
                  />
                </Space>
                <Space>
                  <Text>{t('convert.pdfToWordParseLatticeTable')}</Text>
                  <Switch checked={pdfWordParseLatticeTable} onChange={setPdfWordParseLatticeTable} />
                </Space>
                <Space>
                  <Text>{t('convert.pdfToWordParseStreamTable')}</Text>
                  <Switch checked={pdfWordParseStreamTable} onChange={setPdfWordParseStreamTable} />
                </Space>
                <Space>
                  <Text>{t('convert.pdfToWordDeleteLineHyphen')}</Text>
                  <Switch checked={pdfWordDeleteLineHyphen} onChange={setPdfWordDeleteLineHyphen} />
                </Space>
              </Space>
            )}
          </Space>
        )}
        <div className="pdf-file-block">
          <div onClick={async () => {
              const picked = await pickSinglePath({
                title: t('common.selectFile'),
                filters: [{ name: 'files', extensions: op.accept.replace(/\./g, '').split(',') }],
              });
              if (!picked) return;
              setFile(picked);
              message.success(`${t('common.success')}: ${picked}`);
            }}>
            <Dragger accept={op.accept} maxCount={1} openFileDialogOnClick={false}
              beforeUpload={async (f) => {
                const p = await ensureSingleLocalPath(f, {
                  title: t('common.selectFile'),
                  filters: [{ name: 'files', extensions: op.accept.replace(/\./g, '').split(',') }],
                });
                if (!p) {
                  message.error(t('common.filePathUnavailable'));
                  return Upload.LIST_IGNORE;
                }
                setFile(p);
                return false;
              }}>
              <p className="ant-upload-hint">{t('common.dragHint')}</p>
              <Text type="secondary">{t('common.supportedFormats')}: {op.accept}</Text>
            </Dragger>
          </div>
          <div className="pdf-file-selected-slot">
            <SelectedFileTag path={file} />
          </div>
        </div>
        <OutputPathInput
          value={output}
          onChange={setOutput}
          mode={usesOutputDir ? 'dir' : 'file'}
          ext={usesOutputDir ? undefined : op.ext.replace('.', '')}
        />
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleConvert}>
          {t(op.titleKey)}
        </Button>
        {op.key === 'pdfToMarkdown' && pdfMarkdownResult && (
          <Alert
            type={pdfMarkdownResult.success ? 'success' : 'error'}
            showIcon
            message={
              pdfMarkdownResult.success
                ? `${t('convert.pdfToMarkdownResultTitle')}: ${pdfMarkdownResult.source || 'unknown'}`
                : `${t('common.error')}: ${pdfMarkdownResult.error || 'unknown error'}`
            }
            description={
              pdfMarkdownResult.success ? (
                <Space direction="vertical" size={2}>
                  <Text>{t('convert.pdfToMarkdownResultEngine')}: {pdfMarkdownResult.source || '-'}</Text>
                  <Text>{t('convert.pdfToMarkdownResultPages')}: {pdfMarkdownResult.pages ?? '-'}</Text>
                  <Text>{t('convert.pdfToMarkdownResultImages')}: {pdfMarkdownResult.images_count ?? 0}</Text>
                  <Text>{t('convert.pdfToMarkdownResultOutput')}: {pdfMarkdownResult.output || '-'}</Text>
                </Space>
              ) : undefined
            }
          />
        )}
      </Space>
    );
  };

  /* Images to PDF — multi-file */
  const ImagesToPdfTab = () => {
    const [files, setFiles] = useState<string[]>([]);
    const [output, setOutput] = useState('');

    const handleConvert = async () => {
      if (!files.length) return message.warning('请选择图片文件');
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_files: files };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('convert_images_to_pdf', params);
        if (result.success) message.success(`${t('common.success')}: ${result.output}`);
        else message.error(result.error);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <div className="pdf-file-block">
          <div onClick={async () => {
              const picked = await pickMultiplePaths({
                title: t('common.selectFiles'),
                filters: [{ name: 'images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'] }],
              });
              if (!picked.length) return;
              setFiles(prev => [...prev, ...picked]);
              message.success(`${t('common.success')}: +${picked.length}`);
            }}>
            <Dragger multiple accept=".jpg,.jpeg,.png,.bmp,.tiff,.webp" openFileDialogOnClick={false}
              beforeUpload={async (f) => {
                const paths = await ensureMultipleLocalPaths(f, {
                  title: t('common.selectFiles'),
                  filters: [{ name: 'images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'] }],
                });
                if (!paths.length) {
                  message.error(t('common.filePathUnavailable'));
                  return Upload.LIST_IGNORE;
                }
                setFiles(prev => [...prev, ...paths]);
                return false;
              }}>
              <p className="ant-upload-hint">{t('common.dragHint')}</p>
              <Text type="secondary">JPG, PNG, BMP, TIFF, WebP</Text>
            </Dragger>
          </div>
          <div className="pdf-file-selected-slot">
            {files.length > 0 && (
              <Space wrap>
                {files.map((f, i) => (
                  <Tag key={`${f}-${i}`} closable onClose={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                    {fileBaseName(f)}
                  </Tag>
                ))}
              </Space>
            )}
          </div>
        </div>
        <OutputPathInput value={output} onChange={setOutput} mode="file" ext="pdf" />
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleConvert}>
          {t('convert.imagesToPdf')}
        </Button>

      </Space>
    );
  };

  const MarkdownToExcelTab = () => {
    const [files, setFiles] = useState<string[]>([]);
    const [output, setOutput] = useState('');

    const handleConvert = async () => {
      if (!files.length) return message.warning('请选择 Markdown 文件');
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_files: files };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('convert_markdown_to_excel', params);
        if (result.success) message.success(`${t('common.success')}: ${result.output}`);
        else message.error(result.error);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <div className="pdf-file-block">
          <div onClick={async () => {
              const picked = await pickMultiplePaths({
                title: t('common.selectFiles'),
                filters: [{ name: 'markdown', extensions: ['md', 'markdown'] }],
              });
              if (!picked.length) return;
              setFiles(prev => [...prev, ...picked]);
              message.success(`${t('common.success')}: +${picked.length}`);
            }}>
            <Dragger multiple accept=".md,.markdown" openFileDialogOnClick={false}
              beforeUpload={async (f) => {
                const paths = await ensureMultipleLocalPaths(f, {
                  title: t('common.selectFiles'),
                  filters: [{ name: 'markdown', extensions: ['md', 'markdown'] }],
                });
                if (!paths.length) {
                  message.error(t('common.filePathUnavailable'));
                  return Upload.LIST_IGNORE;
                }
                setFiles(prev => [...prev, ...paths]);
                return false;
              }}>
              <p className="ant-upload-hint">{t('common.dragHint')}</p>
              <Text type="secondary">Markdown: .md, .markdown</Text>
            </Dragger>
          </div>
          <div className="pdf-file-selected-slot">
            {files.length > 0 && (
              <Space wrap>
                {files.map((f, i) => (
                  <Tag key={`${f}-${i}`} closable onClose={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                    {fileBaseName(f)}
                  </Tag>
                ))}
              </Space>
            )}
          </div>
        </div>
        <OutputPathInput value={output} onChange={setOutput} mode="file" ext="xlsx" />
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleConvert}>
          {t('convert.markdownToExcel')}
        </Button>
      </Space>
    );
  };

  const renderContent = () => {
    if (activeOp === 'imagesToPdf') return <ImagesToPdfTab />;
    if (activeOp === 'markdownToExcel') return <MarkdownToExcelTab />;
    const op = OPERATIONS.find(o => o.key === activeOp);
    if (!op) return null;
    return <GenericTab op={op} />;
  };

  const currentOp = OPERATIONS.find(o => o.key === activeOp)!;

  return (
    <div className="tool-page">
      {/* Left operation list */}
      <div className={`tool-nav ${toolNavCollapsed ? 'collapsed' : ''}`}>
        <div className="tool-nav-header">
          <SwapOutlined className="tool-nav-icon" />
          <span className="tool-nav-head-title">格式转换</span>
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
          {OPERATIONS.map(op => (
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

