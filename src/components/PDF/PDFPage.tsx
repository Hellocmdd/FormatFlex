import React, { useState } from 'react';
import {
  Tabs, Card, Upload, Button, Input, InputNumber, Select,
  Slider, message, Typography, Space, Row, Col, Tag,
} from 'antd';
import {
  MergeCellsOutlined, ScissorOutlined,
  LockOutlined, UnlockOutlined, CompressOutlined,
  FontSizeOutlined, NumberOutlined, FileWordOutlined, FilePdfOutlined,
} from '@ant-design/icons';

import { useTranslation } from 'react-i18next';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const PDFPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleResult = (result: PyResult, successMsg?: string) => {
    if (result.success) {
      message.success(successMsg || `${t('common.success')}: ${result.output || ''}`);
    } else {
      message.error(`${t('common.error')}: ${result.error}`);
    }
  };

  // ── Merge ──────────────────────────────────────────────────────────────────
  const MergeTab = () => {
    const [files, setFiles] = useState<string[]>([]);
    const [output, setOutput] = useState('');

    const handleMerge = async () => {
      if (files.length < 2) return message.warning('请至少选择 2 个 PDF 文件');
      if (!output) return message.warning('请指定输出文件路径');
      setLoading(true);
      try {
        const result = await invokeCmd<PyResult>('pdf_merge', {
          input_files: files,
          output_file: output,
        });
        handleResult(result);
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.merge.desc')}</Text>
        <Dragger
          multiple
          accept=".pdf"
          beforeUpload={(file) => {
            setFiles((prev) => [...prev, (file as any).path || file.name]);
            return false;
          }}
          onRemove={() => setFiles([])}
        >
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
          <Text type="secondary">{t('common.supportedFormats')}: PDF</Text>
        </Dragger>
        {files.length > 0 && (
          <Space wrap>
            {files.map((f, i) => <Tag key={i} closable onClose={() => setFiles(prev => prev.filter((_, j) => j !== i))}>{f.split('/').pop()}</Tag>)}
          </Space>
        )}
        <Input
          placeholder={t('common.outputFile')}
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          addonAfter=".pdf"
        />
        <Button type="primary" icon={<MergeCellsOutlined />} loading={loading} onClick={handleMerge}>
          {t('pdf.merge.title')}
        </Button>
      </Space>
    );
  };

  // ── Split ──────────────────────────────────────────────────────────────────
  const SplitTab = () => {
    const [file, setFile] = useState('');
    const [outputDir, setOutputDir] = useState('');
    const [mode, setMode] = useState<'all' | 'range'>('all');
    const [ranges, setRanges] = useState('');

    const parseRanges = (str: string): number[][] => {
      return str.split(',').map(part => {
        const [s, e] = part.trim().split('-').map(Number);
        return [s, e ?? s];
      });
    };

    const handleSplit = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      if (!outputDir) return message.warning('请指定输出目录');
      setLoading(true);
      try {
        const params: Record<string, unknown> = { input_file: file, output_dir: outputDir };
        if (mode === 'range' && ranges) {
          params.ranges = parseRanges(ranges);
        }
        const result = await invokeCmd<PyResult & { outputs?: string[] }>('pdf_split', params);
        if (result.success) {
          message.success(`拆分完成，生成 ${result.outputs?.length ?? 0} 个文件`);
        } else {
          message.error(result.error);
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.split.desc')}</Text>
        <Dragger accept=".pdf" beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }} maxCount={1}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
        <Select value={mode} onChange={setMode} style={{ width: 200 }}
          options={[
            { value: 'all', label: t('pdf.split.allPages') },
            { value: 'range', label: t('pdf.split.byRange') },
          ]}
        />
        {mode === 'range' && (
          <Input placeholder={t('pdf.split.ranges')} value={ranges} onChange={(e) => setRanges(e.target.value)} />
        )}
        <Button type="primary" icon={<ScissorOutlined />} loading={loading} onClick={handleSplit}>
          {t('pdf.split.title')}
        </Button>
      </Space>
    );
  };

  // ── Encrypt ────────────────────────────────────────────────────────────────
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
        const result = await invokeCmd<PyResult>('pdf_encrypt', { input_file: file, output_file: output || file.replace('.pdf', '_encrypted.pdf'), password: pwd });
        handleResult(result);
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.encrypt.desc')}</Text>
        <Dragger accept=".pdf" beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }} maxCount={1}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output} onChange={(e) => setOutput(e.target.value)} />
        <Input.Password placeholder={t('pdf.encrypt.password')} value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Input.Password placeholder={t('pdf.encrypt.confirmPassword')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="primary" icon={<LockOutlined />} loading={loading} onClick={handleEncrypt}>
          {t('pdf.encrypt.title')}
        </Button>
      </Space>
    );
  };

  // ── Decrypt ────────────────────────────────────────────────────────────────
  const DecryptTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [pwd, setPwd] = useState('');

    const handleDecrypt = async () => {
      if (!file || !pwd) return message.warning('请选择文件并输入密码');
      setLoading(true);
      try {
        const result = await invokeCmd<PyResult>('pdf_decrypt', { input_file: file, output_file: output || file.replace('.pdf', '_decrypted.pdf'), password: pwd });
        handleResult(result);
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.decrypt.desc')}</Text>
        <Dragger accept=".pdf" beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }} maxCount={1}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output} onChange={(e) => setOutput(e.target.value)} />
        <Input.Password placeholder={t('pdf.decrypt.password')} value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Button type="primary" icon={<UnlockOutlined />} loading={loading} onClick={handleDecrypt}>
          {t('pdf.decrypt.title')}
        </Button>
      </Space>
    );
  };

  // ── Compress ───────────────────────────────────────────────────────────────
  const CompressTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [result, setResult] = useState<{ original_size?: number; compressed_size?: number; ratio?: number } | null>(null);

    const handleCompress = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true);
      try {
        const res = await invokeCmd<PyResult & { original_size?: number; compressed_size?: number; ratio?: number }>('pdf_compress', {
          input_file: file,
          output_file: output || file.replace('.pdf', '_compressed.pdf'),
        });
        if (res.success) {
          setResult(res);
          message.success(t('common.success'));
        } else {
          message.error(res.error);
        }
      } finally {
        setLoading(false);
      }
    };

    const fmt = (b?: number) => b ? (b / 1024).toFixed(1) + ' KB' : '-';

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.compress.desc')}</Text>
        <Dragger accept=".pdf" beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }} maxCount={1}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output} onChange={(e) => setOutput(e.target.value)} />
        <Button type="primary" icon={<CompressOutlined />} loading={loading} onClick={handleCompress}>
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

  // ── Watermark ──────────────────────────────────────────────────────────────
  const WatermarkTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [text, setText] = useState('');
    const [fontSize, setFontSize] = useState(40);
    const [opacity, setOpacity] = useState(0.3);
    const [color, setColor] = useState('gray');

    const handleWatermark = async () => {
      if (!file || !text) return message.warning('请选择文件并输入水印文字');
      setLoading(true);
      try {
        const result = await invokeCmd<PyResult>('pdf_watermark', {
          input_file: file,
          output_file: output || file.replace('.pdf', '_watermarked.pdf'),
          text, font_size: fontSize, opacity, color,
        });
        handleResult(result);
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.watermark.desc')}</Text>
        <Dragger accept=".pdf" beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }} maxCount={1}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output} onChange={(e) => setOutput(e.target.value)} />
        <Input placeholder={t('pdf.watermark.text')} value={text} onChange={(e) => setText(e.target.value)} />
        <Row gutter={16}>
          <Col span={8}>
            <Text>{t('pdf.watermark.fontSize')}: {fontSize}</Text>
            <Slider min={10} max={100} value={fontSize} onChange={setFontSize} />
          </Col>
          <Col span={8}>
            <Text>{t('pdf.watermark.opacity')}: {opacity}</Text>
            <Slider min={0.05} max={1} step={0.05} value={opacity} onChange={setOpacity} />
          </Col>
          <Col span={8}>
            <Select value={color} onChange={setColor} style={{ width: '100%' }}
              options={['gray', 'red', 'blue', 'black'].map(c => ({ value: c, label: t(`pdf.watermark.colors.${c}`) }))}
            />
          </Col>
        </Row>
        <Button type="primary" icon={<FontSizeOutlined />} loading={loading} onClick={handleWatermark}>
          {t('pdf.watermark.title')}
        </Button>
      </Space>
    );
  };

  // ── Page Numbers ───────────────────────────────────────────────────────────
  const PageNumbersTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');
    const [position, setPosition] = useState('bottom-center');
    const [start, setStart] = useState(1);
    const [fontSize, setFontSize] = useState(12);

    const handleAdd = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true);
      try {
        const result = await invokeCmd<PyResult>('pdf_page_numbers', {
          input_file: file,
          output_file: output || file.replace('.pdf', '_numbered.pdf'),
          position, start, font_size: fontSize,
        });
        handleResult(result);
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.pageNumbers.desc')}</Text>
        <Dragger accept=".pdf" beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }} maxCount={1}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output} onChange={(e) => setOutput(e.target.value)} />
        <Row gutter={16}>
          <Col span={12}>
            <Select value={position} onChange={setPosition} style={{ width: '100%' }}
              options={['bottom-center', 'bottom-right', 'bottom-left', 'top-center'].map(p => ({
                value: p, label: t(`pdf.pageNumbers.positions.${p}`)
              }))}
            />
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
        <Button type="primary" icon={<NumberOutlined />} loading={loading} onClick={handleAdd}>
          {t('pdf.pageNumbers.title')}
        </Button>
      </Space>
    );
  };

  // ── PDF to DOCX ────────────────────────────────────────────────────────────
  const ToDocxTab = () => {
    const [file, setFile] = useState('');
    const [output, setOutput] = useState('');

    const handleConvert = async () => {
      if (!file) return message.warning('请选择 PDF 文件');
      setLoading(true);
      try {
        const result = await invokeCmd<PyResult>('pdf_to_docx', {
          input_file: file,
          output_file: output || file.replace('.pdf', '.docx'),
        });
        handleResult(result);
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{t('pdf.toDocx.desc')}</Text>
        <Dragger accept=".pdf" beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }} maxCount={1}>
          <p className="ant-upload-hint">{t('common.dragHint')}</p>
        </Dragger>
        <Input placeholder={t('common.outputFile')} value={output} onChange={(e) => setOutput(e.target.value)} addonAfter=".docx" />
        <Button type="primary" icon={<FileWordOutlined />} loading={loading} onClick={handleConvert}>
          {t('pdf.toDocx.title')}
        </Button>
      </Space>
    );
  };

  const tabs = [
    { key: 'merge', label: t('pdf.merge.title'), children: <MergeTab /> },
    { key: 'split', label: t('pdf.split.title'), children: <SplitTab /> },
    { key: 'encrypt', label: t('pdf.encrypt.title'), children: <EncryptTab /> },
    { key: 'decrypt', label: t('pdf.decrypt.title'), children: <DecryptTab /> },
    { key: 'compress', label: t('pdf.compress.title'), children: <CompressTab /> },
    { key: 'watermark', label: t('pdf.watermark.title'), children: <WatermarkTab /> },
    { key: 'pageNumbers', label: t('pdf.pageNumbers.title'), children: <PageNumbersTab /> },
    { key: 'toDocx', label: t('pdf.toDocx.title'), children: <ToDocxTab /> },
  ];

  return (
    <Card>
      <Title level={4}><FilePdfOutlined /> {t('nav.pdf')}</Title>
      <Tabs items={tabs} />
    </Card>
  );
};

export default PDFPage;
