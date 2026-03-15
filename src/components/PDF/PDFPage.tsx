import React, { useEffect, useRef, useState } from 'react';
import {
  Upload, Button, Input, InputNumber, Select,
  Slider, message, Typography, Space, Row, Col, Tag,
} from 'antd';
import {
  MergeCellsOutlined, ScissorOutlined,
  LockOutlined, UnlockOutlined, CompressOutlined,
  NumberOutlined, FilePdfOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
  ReloadOutlined, RetweetOutlined,
  PlusOutlined, MinusOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  OrderedListOutlined, KeyOutlined, BgColorsOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { convertFileSrc } from '@tauri-apps/api/core';

import { useTranslation } from 'react-i18next';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';
import BruteforcePanel from './BruteforcePanel';
import {
  ensureMultipleLocalPaths,
  ensureSingleLocalPath,
  pickMultiplePaths,
  pickSinglePath,
} from '../../utils/filePicker';
import SharedOutputPathInput from '../common/OutputPathInput';

const { Text } = Typography;
const { Dragger } = Upload;

/* ── Operation definitions ─────────────────────────── */
const OPERATIONS = [
  { key: 'merge',       icon: <MergeCellsOutlined />, color: '#4D84FF',  colorBg: 'rgba(77,132,255,0.12)' },
  { key: 'reorder',     icon: <OrderedListOutlined />,color: '#38BDF8',  colorBg: 'rgba(56,189,248,0.12)' },
  { key: 'split',       icon: <ScissorOutlined />,    color: '#34C48A',  colorBg: 'rgba(52,196,138,0.12)' },
  { key: 'encrypt',     icon: <LockOutlined />,       color: '#FBBF24',  colorBg: 'rgba(251,191,36,0.12)'  },
  { key: 'decrypt',     icon: <UnlockOutlined />,     color: '#34C48A',  colorBg: 'rgba(52,196,138,0.12)' },
  { key: 'bruteforce',  icon: <KeyOutlined />,        color: '#F56776',  colorBg: 'rgba(245,103,118,0.12)' },
  { key: 'compress',    icon: <CompressOutlined />,   color: '#A78BFA',  colorBg: 'rgba(167,139,250,0.12)' },
  { key: 'watermark',   icon: <BgColorsOutlined />,   color: '#22D3EE',  colorBg: 'rgba(34,211,238,0.12)'  },
  { key: 'pageNumbers', icon: <NumberOutlined />,     color: '#F0883E',  colorBg: 'rgba(240,136,62,0.12)'  },
];

const PDFPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeOp, setActiveOp] = useState('merge');
  const [toolNavCollapsed, setToolNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem('pdf_tool_nav_collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pdf_tool_nav_collapsed', toolNavCollapsed ? '1' : '0');
    } catch {
      // Ignore storage failures and keep UI usable.
    }
  }, [toolNavCollapsed]);

  const fileBaseName = (path: string) => path.split('/').pop() || path;
  const SelectedFileTag = ({ path }: { path: string }) => (
    path ? <Tag className="pdf-selected-file">{t('common.selectedFile')}: {fileBaseName(path)}</Tag> : null
  );

  const SingleFileInput = ({
    value,
    setValue,
    filters,
  }: {
    value: string;
    setValue: React.Dispatch<React.SetStateAction<string>>;
    filters: { name: string; extensions: string[] }[];
  }) => (
    <div className="pdf-file-block">
      <div onClick={async () => {
          const picked = await pickSinglePath({ title: t('common.selectFile'), filters });
          if (!picked) return;
          setValue(picked);
          message.success(`${t('common.success')}: ${picked}`);
        }}>
        <Dragger
          accept=".pdf"
          openFileDialogOnClick={false}
          beforeUpload={async (f) => {
            const p = await ensureSingleLocalPath(f, { title: t('common.selectFile'), filters });
            if (!p) {
              message.error(t('common.filePathUnavailable'));
              return Upload.LIST_IGNORE;
            }
            setValue(p);
            return false;
          }}
          maxCount={1}
        >
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
      </div>
      <div className="pdf-file-selected-slot">
        <SelectedFileTag path={value} />
      </div>
    </div>
  );

  const OutputPathInput = ({
    value,
    setValue,
    isDir = false,
    ext = 'pdf',
  }: {
    value: string;
    setValue: (v: string) => void;
    isDir?: boolean;
    ext?: string;
  }) => (
    <SharedOutputPathInput value={value} onChange={setValue} mode={isDir ? 'dir' : 'file'} ext={isDir ? undefined : ext} />
  );

  const PreviewViewer = ({ src, alt }: { src: string; alt: string }) => {
    const [zoom, setZoom] = useState(1);
    const [dragging, setDragging] = useState(false);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const dragState = useRef({ startX: 0, startY: 0, startTx: 0, startTy: 0 });
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const clamp = (v: number) => Math.max(0.5, Math.min(3, Number(v.toFixed(2))));
    const zoomIn = () => setZoom((z) => clamp(z + 0.1));
    const zoomOut = () => setZoom((z) => clamp(z - 0.1));
    const resetZoom = () => {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };

    useEffect(() => {
      if (!dragging) return;
      const onMove = (e: MouseEvent) => {
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        setOffset({ x: dragState.current.startTx + dx, y: dragState.current.startTy + dy });
      };
      const onUp = () => setDragging(false);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }, [dragging]);

    return (
      <>
        <div className="pdf-preview-toolbar">
          <Button size="small" onClick={zoomOut} icon={<MinusOutlined />} />
          <Text className="pdf-preview-zoom-text">{Math.round(zoom * 100)}%</Text>
          <Button size="small" onClick={zoomIn} icon={<PlusOutlined />} />
          <Button size="small" onClick={resetZoom}>{t('common.reset')}</Button>
        </div>
        <div
          className="pdf-preview-stage"
          ref={stageRef}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
            dragState.current = {
              startX: e.clientX,
              startY: e.clientY,
              startTx: offset.x,
              startTy: offset.y,
            };
          }}
          onWheelCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -0.08 : 0.08;
            setZoom((z) => clamp(z + delta));
          }}
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        >
          <img
            className="pdf-preview-image"
            src={src}
            alt={alt}
            draggable={false}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          />
        </div>
      </>
    );
  };

  const handleResult = (result: PyResult, successMsg?: string) => {
    if (result.success) {
      message.success(successMsg || `${t('common.success')}: ${result.output || ''}`);
    } else {
      message.error(`${t('common.error')}: ${result.error}`);
    }
  };

  // ── Merge ──────────────────────────────────────────
  const MergeTab = () => {
    const [files, setFiles] = useState<string[]>([]);
    const [output, setOutput] = useState('');

    const moveFileByStep = (index: number, step: number) => {
      setFiles((prev) => {
        const target = index + step;
        if (index < 0 || index >= prev.length || target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        return next;
      });
    };

    const handleMerge = async () => {
      if (files.length < 2) return message.warning('请至少选择 2 个 PDF 文件');
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_files: files };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('pdf_merge', params);
        handleResult(result);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.merge.desc')}</Text>
        <div className="pdf-file-block">
          <div onClick={async () => {
              const picked = await pickMultiplePaths({
                title: t('common.selectFiles'),
                filters: [{ name: 'pdf', extensions: ['pdf'] }],
              });
              if (!picked.length) return;
              setFiles((prev) => [...prev, ...picked]);
              message.success(`${t('common.success')}: +${picked.length}`);
            }}>
            <Dragger multiple accept=".pdf" openFileDialogOnClick={false}
              beforeUpload={async (file) => {
                const paths = await ensureMultipleLocalPaths(file, {
                  title: t('common.selectFiles'),
                  filters: [{ name: 'pdf', extensions: ['pdf'] }],
                });
                if (!paths.length) {
                  message.error(t('common.filePathUnavailable'));
                  return Upload.LIST_IGNORE;
                }
                setFiles((prev) => [...prev, ...paths]);
                return false;
              }}
              onRemove={() => setFiles([])}>
              <p className="ant-upload-hint">{t('common.dragHint')}</p>
            </Dragger>
          </div>
          <div className="pdf-file-selected-slot">
            {files.length > 0 && (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {files.map((f, i) => (
                  <div key={`${f}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                    <Tag style={{ flex: 1, minWidth: 0, marginInlineEnd: 0 }}>
                      #{i + 1} {f.split('/').pop()}
                    </Tag>
                    <Button
                      size="small"
                      icon={<ArrowUpOutlined />}
                      disabled={i === 0}
                      onClick={() => moveFileByStep(i, -1)}
                    >
                      {t('pdf.merge.moveUp')}
                    </Button>
                    <Button
                      size="small"
                      icon={<ArrowDownOutlined />}
                      disabled={i === files.length - 1}
                      onClick={() => moveFileByStep(i, 1)}
                    >
                      {t('pdf.merge.moveDown')}
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    >
                      {t('pdf.merge.remove')}
                    </Button>
                  </div>
                ))}
              </Space>
            )}
          </div>
        </div>
        <OutputPathInput value={output} setValue={setOutput} />
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleMerge}>
          {t('pdf.merge.title')}
        </Button>
      </Space>
    );
  };

  // ── Reorder Pages ──────────────────────────────────
  const ReorderTab = () => {
    type PagePreview = { page: number; image: string; preview_data_url?: string };
    type PreviewPagesResult = PyResult & { total_pages?: number; previews?: PagePreview[] };

    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [pages, setPages] = useState<PagePreview[]>([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [draggingPage, setDraggingPage] = useState<number | null>(null);
    const [dragOverPage, setDragOverPage] = useState<number | null>(null);

    const loadPreviewPages = async (inputFile: string) => {
      if (!inputFile) {
        setPages([]);
        return;
      }
      setLoadingPages(true);
      try {
        const result = await invokeCmd<PreviewPagesResult>('pdf_preview_pages', {
          input_file: inputFile,
          dpi: 88,
          max_width: 220,
        });
        if (result.success && result.previews) {
          setPages(result.previews);
        } else {
          setPages([]);
          message.error(result.error || t('common.error'));
        }
      } finally {
        setLoadingPages(false);
      }
    };

    const movePage = (fromPage: number, toPage: number) => {
      if (fromPage === toPage) return;
      setPages((prev) => {
        const fromIdx = prev.findIndex((p) => p.page === fromPage);
        const toIdx = prev.findIndex((p) => p.page === toPage);
        if (fromIdx < 0 || toIdx < 0) return prev;
        const next = [...prev];
        const [item] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, item);
        return next;
      });
    };

    const movePageByStep = (page: number, step: number) => {
      setPages((prev) => {
        const fromIdx = prev.findIndex((p) => p.page === page);
        const toIdx = fromIdx + step;
        if (fromIdx < 0 || toIdx < 0 || toIdx >= prev.length) return prev;
        const next = [...prev];
        const [item] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, item);
        return next;
      });
    };

    const handleResetOrder = () => {
      setPages((prev) => [...prev].sort((a, b) => a.page - b.page));
    };

    const handleReverseOrder = () => {
      setPages((prev) => [...prev].reverse());
    };

    const orderSummary = pages.map((p) => p.page).join(', ');
    const orderSummaryText = pages.length > 28
      ? `${pages.slice(0, 28).map((p) => p.page).join(', ')} ...`
      : orderSummary;

    const handleSaveReordered = async () => {
      if (!file) return message.warning(t('pdf.reorder.pickFileFirst'));
      if (!pages.length) return message.warning(t('pdf.reorder.noPages'));

      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          input_file: file,
          page_order: pages.map((p) => p.page),
        };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('pdf_reorder_pages', params);
        handleResult(result);
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.reorder.desc')}</Text>
        <SingleFileInput
          value={file}
          setValue={(v) => {
            const val = typeof v === 'function' ? v(file) : v;
            setFile(val);
            setPages([]);
            setDraggingPage(null);
            setDragOverPage(null);
            if (val) {
              void loadPreviewPages(val);
            }
          }}
          filters={[{ name: 'pdf', extensions: ['pdf'] }]}
        />
        <OutputPathInput value={output} setValue={setOutput} />

        <div className="pdf-reorder-card">
          <div className="pdf-reorder-card-head">
            <div className="pdf-reorder-head-left">
              <Text strong>{t('pdf.reorder.pageList')}</Text>
              <Text type="secondary">{t('pdf.reorder.dragHint')}</Text>
            </div>
            <Space size={8} wrap>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                disabled={!file}
                onClick={() => file && void loadPreviewPages(file)}
              >
                {t('pdf.reorder.reload')}
              </Button>
              <Button
                size="small"
                icon={<RetweetOutlined />}
                disabled={pages.length < 2}
                onClick={handleReverseOrder}
              >
                {t('pdf.reorder.reverse')}
              </Button>
              <Button
                size="small"
                disabled={pages.length < 2}
                onClick={handleResetOrder}
              >
                {t('pdf.reorder.reset')}
              </Button>
            </Space>
          </div>
          {pages.length > 0 && (
            <div className="pdf-reorder-summary">
              <Text type="secondary">{t('pdf.reorder.orderSummary')}: {orderSummaryText}</Text>
            </div>
          )}
          {loadingPages ? (
            <Text type="secondary">{t('common.processing')}</Text>
          ) : pages.length ? (
            <div className="pdf-reorder-grid">
              {pages.map((item, idx) => {
                const isActiveDrag = draggingPage === item.page;
                const isOver = dragOverPage === item.page;
                return (
                  <div
                    key={item.page}
                    className={`pdf-reorder-item ${isActiveDrag ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      // Some desktop webviews require explicit drag payload for left-button dragging.
                      e.dataTransfer.setData('text/plain', String(item.page));
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingPage(item.page);
                      setDragOverPage(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (draggingPage && draggingPage !== item.page) {
                        setDragOverPage(item.page);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverPage === item.page) setDragOverPage(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const payload = Number(e.dataTransfer.getData('text/plain'));
                      const sourcePage = Number.isFinite(payload) && payload > 0 ? payload : draggingPage;
                      if (sourcePage) {
                        movePage(sourcePage, item.page);
                      }
                      setDraggingPage(null);
                      setDragOverPage(null);
                    }}
                    onDragEnd={() => {
                      setDraggingPage(null);
                      setDragOverPage(null);
                    }}
                  >
                    <div className="pdf-reorder-thumb-wrap">
                      <img
                        src={item.preview_data_url || convertFileSrc(item.image)}
                        alt={`page-${item.page}`}
                        className="pdf-reorder-thumb"
                        draggable={false}
                      />
                    </div>
                    <div className="pdf-reorder-meta">
                      <Text className="pdf-reorder-page-no">{t('pdf.reorder.page')} {item.page}</Text>
                      <Tag>{t('pdf.reorder.newOrder')} #{idx + 1}</Tag>
                    </div>
                    <div className="pdf-reorder-mobile-actions">
                      <Button
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={idx === 0}
                        onClick={() => movePageByStep(item.page, -1)}
                      >
                        {t('pdf.reorder.moveUp')}
                      </Button>
                      <Button
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={idx === pages.length - 1}
                        onClick={() => movePageByStep(item.page, 1)}
                      >
                        {t('pdf.reorder.moveDown')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Text type="secondary">{t('pdf.reorder.empty')}</Text>
          )}
        </div>

        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleSaveReordered}>
          {t('pdf.reorder.title')}
        </Button>
      </Space>
    );
  };

  // ── Split ──────────────────────────────────────────
  const SplitTab = () => {
    const [file, setFile] = useState('');
    const [outputDir, setOutputDir] = useState('');
    const [mode, setMode] = useState<'all' | 'range'>('all');
    const [ranges, setRanges] = useState('');

    const parseRanges = (str: string): number[][] =>
      str.split(',').map(part => { const [s, e] = part.trim().split('-').map(Number); return [s, e ?? s]; });

    const handleSplit = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_file: file };
        if (outputDir.trim()) params.output_dir = outputDir.trim();
        if (mode === 'range' && ranges) params.ranges = parseRanges(ranges);
        const result = await invokeCmd<PyResult & { outputs?: string[] }>('pdf_split', params);
        if (result.success) {
          const first = result.outputs?.[0];
          const actualDir = first ? first.substring(0, first.lastIndexOf('/')) : (outputDir || file.substring(0, file.lastIndexOf('/')));
          message.success(`拆分完成，生成 ${result.outputs?.length ?? 0} 个文件，保存到: ${actualDir}`);
        }
        else message.error(result.error);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.split.desc')}</Text>
        <SingleFileInput value={file} setValue={setFile} filters={[{ name: 'pdf', extensions: ['pdf'] }]} />
        <OutputPathInput value={outputDir} setValue={setOutputDir} isDir />
        <Select value={mode} onChange={setMode} style={{ width: 200 }}
          options={[{ value: 'all', label: t('pdf.split.allPages') }, { value: 'range', label: t('pdf.split.byRange') }]} />
        {mode === 'range' && (
          <Input placeholder={t('pdf.split.ranges')} value={ranges} onChange={(e) => setRanges(e.target.value)} />
        )}
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleSplit}>
          {t('pdf.split.title')}
        </Button>
      </Space>
    );
  };

  // ── Encrypt ────────────────────────────────────────
  const EncryptTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [pwd, setPwd] = useState('');
    const [confirm, setConfirm] = useState('');

    const handleEncrypt = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      if (!pwd) return message.warning('请输入密码');
      if (pwd !== confirm) return message.error(t('pdf.encrypt.passwordMismatch'));
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_file: file, password: pwd };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('pdf_encrypt', params);
        handleResult(result);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.encrypt.desc')}</Text>
        <SingleFileInput value={file} setValue={setFile} filters={[{ name: 'pdf', extensions: ['pdf'] }]} />
        <OutputPathInput value={output} setValue={setOutput} />
        <Input.Password placeholder={t('pdf.encrypt.password')} value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Input.Password placeholder={t('pdf.encrypt.confirmPassword')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleEncrypt}>
          {t('pdf.encrypt.title')}
        </Button>
      </Space>
    );
  };

  // ── Decrypt ────────────────────────────────────────
  const DecryptTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [pwd, setPwd] = useState('');

    const handleDecrypt = async () => {
      if (!file || !pwd) return message.warning('请选择文件并输入密码');
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_file: file, password: pwd };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('pdf_decrypt', params);
        handleResult(result);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.decrypt.desc')}</Text>
        <SingleFileInput value={file} setValue={setFile} filters={[{ name: 'pdf', extensions: ['pdf'] }]} />
        <OutputPathInput value={output} setValue={setOutput} />
        <Input.Password placeholder={t('pdf.decrypt.password')} value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleDecrypt}>
          {t('pdf.decrypt.title')}
        </Button>
      </Space>
    );
  };

  // ── Compress ───────────────────────────────────────
  const CompressTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [result, setResult] = useState<{ original_size?: number; compressed_size?: number; ratio?: number } | null>(null);

    const handleCompress = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_file: file };
        if (output.trim()) params.output_file = output.trim();
        const res = await invokeCmd<PyResult & { original_size?: number; compressed_size?: number; ratio?: number }>('pdf_compress', params);
        if (res.success) { setResult(res); message.success(t('common.success')); }
        else message.error(res.error);
      } finally { setLoading(false); }
    };

    const fmt = (b?: number) => b ? (b / 1024).toFixed(1) + ' KB' : '-';

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.compress.desc')}</Text>
        <SingleFileInput value={file} setValue={setFile} filters={[{ name: 'pdf', extensions: ['pdf'] }]} />
        <OutputPathInput value={output} setValue={setOutput} />
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleCompress}>
          {t('pdf.compress.title')}
        </Button>
        {result && (
          <Row gutter={16} style={{ marginTop: 8 }}>
            <Col><Tag color="blue">{t('pdf.compress.originalSize')}: {fmt(result.original_size)}</Tag></Col>
            <Col><Tag color="green">{t('pdf.compress.compressedSize')}: {fmt(result.compressed_size)}</Tag></Col>
            <Col><Tag color="gold">{t('pdf.compress.ratio')}: {result.ratio}%</Tag></Col>
          </Row>
        )}
      </Space>
    );
  };

  // ── Watermark ──────────────────────────────────────
  const WatermarkTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [mode, setMode] = useState<'text' | 'image'>('text');
    const [text, setText] = useState('');
    const [imagePath, setImagePath] = useState('');
    const [fontSize, setFontSize] = useState(40);
    const [opacity, setOpacity] = useState(0.3);
    const [imageScale, setImageScale] = useState(0.4);
    const [color, setColor] = useState('gray');
    const [previewSrc, setPreviewSrc] = useState('');

    useEffect(() => {
      const canPreview = Boolean(file && ((mode === 'text' && text.trim()) || (mode === 'image' && imagePath.trim())));
      if (!canPreview) {
        setPreviewSrc('');
        return;
      }
      const timer = setTimeout(async () => {
        type PreviewResult = PyResult & { preview_data_url?: string };
        const params: Record<string, unknown> = {
          input_file: file,
          text: mode === 'text' ? text : '',
          image_path: mode === 'image' ? imagePath : '',
          font_size: fontSize,
          opacity,
          image_scale: imageScale,
          color,
        };
        const result = await invokeCmd<PreviewResult>('pdf_preview_watermark', params);
        if (result.success && result.output) {
          setPreviewSrc(result.preview_data_url || convertFileSrc(result.output));
        }
      }, 220);

      return () => clearTimeout(timer);
    }, [file, mode, text, imagePath, fontSize, opacity, imageScale, color]);

    const handleWatermark = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      if (mode === 'text' && !text.trim()) return message.warning(t('pdf.watermark.textRequired'));
      if (mode === 'image' && !imagePath.trim()) return message.warning(t('pdf.watermark.imageRequired'));
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          input_file: file,
          text: mode === 'text' ? text : '',
          image_path: mode === 'image' ? imagePath : '',
          font_size: fontSize,
          opacity,
          image_scale: imageScale,
          color,
        };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('pdf_watermark', params);
        handleResult(result);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.watermark.desc')}</Text>
        <SingleFileInput value={file} setValue={setFile} filters={[{ name: 'pdf', extensions: ['pdf'] }]} />
        <OutputPathInput value={output} setValue={setOutput} />
        <Select
          value={mode}
          onChange={(v) => setMode(v as 'text' | 'image')}
          options={[
            { value: 'text', label: t('pdf.watermark.modes.text') },
            { value: 'image', label: t('pdf.watermark.modes.image') },
          ]}
          style={{ width: 220 }}
        />
        {mode === 'text' ? (
          <Input placeholder={t('pdf.watermark.text')} value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <div className="pdf-file-block">
            <div className="pdf-file-actions">
              <Button
                onClick={async () => {
                  const picked = await pickSinglePath({
                    title: t('pdf.watermark.selectImage'),
                    filters: [{ name: 'images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
                  });
                  if (!picked) return;
                  setImagePath(picked);
                }}
              >
                {t('pdf.watermark.selectImage')}
              </Button>
            </div>
            <div className="pdf-file-selected-slot">
              <SelectedFileTag path={imagePath} />
            </div>
          </div>
        )}
        <Row gutter={16}>
          <Col span={8}>
            <Text>{t('pdf.watermark.opacity')}: {opacity}</Text>
            <Slider min={0.05} max={1} step={0.05} value={opacity} onChange={setOpacity} />
          </Col>
          <Col span={8}>
            {mode === 'text' ? (
              <>
                <Text>{t('pdf.watermark.fontSize')}: {fontSize}</Text>
                <Slider min={10} max={100} value={fontSize} onChange={setFontSize} />
              </>
            ) : (
              <>
                <Text>{t('pdf.watermark.imageScale')}: {imageScale.toFixed(2)}</Text>
                <Slider min={0.1} max={1} step={0.05} value={imageScale} onChange={setImageScale} />
              </>
            )}
          </Col>
          {mode === 'text' && (
            <Col span={8}>
              <Select value={color} onChange={setColor} style={{ width: '100%' }}
                options={['gray', 'red', 'blue', 'black'].map(c => ({ value: c, label: t(`pdf.watermark.colors.${c}`) }))} />
            </Col>
          )}
        </Row>
        <div className="pdf-preview-card">
          <Text type="secondary">{t('pdf.preview.watermark')}</Text>
          {previewSrc ? (
            <PreviewViewer src={previewSrc} alt="watermark-preview" />
          ) : (
            <div className="pdf-preview-page watermark-preview-page">
              <span className="pdf-watermark-preview-text empty">{t('pdf.preview.empty')}</span>
            </div>
          )}
        </div>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleWatermark}>
          {t('pdf.watermark.title')}
        </Button>
      </Space>
    );
  };

  // ── Page Numbers ───────────────────────────────────
  const PageNumbersTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [position, setPosition] = useState('bottom-center');
    const [start, setStart] = useState(1);
    const [fontSize, setFontSize] = useState(12);
    const [previewSrc, setPreviewSrc] = useState('');

    useEffect(() => {
      if (!file) {
        setPreviewSrc('');
        return;
      }
      const timer = setTimeout(async () => {
        type PreviewResult = PyResult & { preview_data_url?: string };
        const result = await invokeCmd<PreviewResult>('pdf_preview_page_numbers', {
          input_file: file,
          position,
          start,
          font_size: fontSize,
        });
        if (result.success && result.output) {
          setPreviewSrc(result.preview_data_url || convertFileSrc(result.output));
        }
      }, 220);
      return () => clearTimeout(timer);
    }, [file, position, start, fontSize]);

    const handleAdd = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          input_file: file,
          position,
          start,
          font_size: fontSize,
        };
        if (output.trim()) params.output_file = output.trim();
        const result = await invokeCmd<PyResult>('pdf_page_numbers', params);
        handleResult(result);
      } finally { setLoading(false); }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.pageNumbers.desc')}</Text>
        <SingleFileInput value={file} setValue={setFile} filters={[{ name: 'pdf', extensions: ['pdf'] }]} />
        <OutputPathInput value={output} setValue={setOutput} />
        <Row gutter={16}>
          <Col span={12}>
            <Select value={position} onChange={setPosition} style={{ width: '100%' }}
              options={['bottom-center', 'bottom-right', 'bottom-left', 'top-center'].map(p => ({
                value: p, label: t(`pdf.pageNumbers.positions.${p}`)
              }))} />
          </Col>
          <Col span={6}>
            <InputNumber min={1} value={start} onChange={(v) => setStart(v ?? 1)}
              addonBefore={t('pdf.pageNumbers.startFrom')} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <InputNumber min={6} max={36} value={fontSize} onChange={(v) => setFontSize(v ?? 12)}
              addonBefore={t('pdf.pageNumbers.fontSize')} style={{ width: '100%' }} />
          </Col>
        </Row>
        <div className="pdf-preview-card">
          <Text type="secondary">{t('pdf.preview.pageNumber')}</Text>
          {previewSrc ? (
            <PreviewViewer src={previewSrc} alt="page-number-preview" />
          ) : (
            <div className="pdf-preview-page">
              <span className="pdf-watermark-preview-text empty">{t('pdf.preview.empty')}</span>
            </div>
          )}
        </div>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleAdd}>
          {t('pdf.pageNumbers.title')}
        </Button>
      </Space>
    );
  };

  /* ── Operation label map ─────────────────────────── */
  const opLabels: Record<string, string> = {
    merge: t('pdf.merge.title'),
    reorder: t('pdf.reorder.title'),
    split: t('pdf.split.title'),
    encrypt: t('pdf.encrypt.title'),
    decrypt: t('pdf.decrypt.title'),
    bruteforce: '暴力破解',
    compress: t('pdf.compress.title'),
    watermark: t('pdf.watermark.title'),
    pageNumbers: t('pdf.pageNumbers.title'),
  };

  const renderContent = () => {
    switch (activeOp) {
      case 'merge':       return <MergeTab />;
      case 'reorder':     return <ReorderTab />;
      case 'split':       return <SplitTab />;
      case 'encrypt':     return <EncryptTab />;
      case 'decrypt':     return <DecryptTab />;
      case 'bruteforce':  return <BruteforcePanel />;
      case 'compress':    return <CompressTab />;
      case 'watermark':   return <WatermarkTab />;
      case 'pageNumbers': return <PageNumbersTab />;
      default:            return null;
    }
  };

  const currentOp = OPERATIONS.find(o => o.key === activeOp)!;

  return (
    <div className="tool-page">
      {/* Left operation list */}
      <div className={`tool-nav ${toolNavCollapsed ? 'collapsed' : ''}`}>
        <div className="tool-nav-header">
          <FilePdfOutlined className="tool-nav-icon" />
          <span className="tool-nav-head-title">PDF 工具</span>
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
              title={opLabels[op.key]}
            >
              <span className="tni-icon">{op.icon}</span>
              <span className="tni-label">{opLabels[op.key]}</span>
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
            <div className="tool-panel-title">{opLabels[activeOp]}</div>
          </div>
        </div>
        <div className="tool-panel-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default PDFPage;

