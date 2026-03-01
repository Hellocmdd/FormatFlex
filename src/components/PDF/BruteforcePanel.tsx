import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Upload, Button, Checkbox, InputNumber, Tabs, Progress,
  message, Typography, Space, Row, Col, Tag, Alert, Statistic, Divider,
  Input,
} from 'antd';
import {
  ThunderboltOutlined, StopOutlined,
  CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation as _useTranslation } from 'react-i18next'; // kept for future i18n

const { Text } = Typography;
const { Dragger } = Upload;

interface ProgressEvent {
  type: 'progress' | 'found' | 'done' | 'error';
  tried?: number;
  total?: number;
  speed?: number;
  eta?: number;
  elapsed?: number;
  password?: string;
  found?: boolean;
  error?: string;
}

const CHARSET_OPTIONS = [
  { value: 'digits',  label: '数字 0-9',     example: '0123456789' },
  { value: 'lower',   label: '小写字母 a-z',  example: 'abcdefghijklmnopqrstuvwxyz' },
  { value: 'upper',   label: '大写字母 A-Z',  example: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { value: 'symbols', label: '特殊字符',       example: '!@#$%^&*...' },
];

const BruteforcePanel: React.FC = () => {
  const [pdfPath, setPdfPath] = useState('');
  const [mode, setMode] = useState<'charset' | 'dict'>('charset');
  const [charsetKeys, setCharsetKeys] = useState<string[]>(['digits']);
  const [customCharset, setCustomCharset] = useState('');
  const [minLen, setMinLen] = useState(1);
  const [maxLen, setMaxLen] = useState(4);
  const [dictPath, setDictPath] = useState('');
  const [workers, setWorkers] = useState(0); // 0 = auto (cpu_count)

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<ProgressEvent | null>(null);

  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Subscribe to Tauri bruteforce events
  useEffect(() => {
    let unlisten: UnlistenFn;
    listen<ProgressEvent>('bruteforce_progress', (event) => {
      const data = event.payload;
      if (data.type === 'progress') {
        setProgress(data);
      } else if (data.type === 'found' || data.type === 'done' || data.type === 'error') {
        setProgress(null);
        setResult(data);
        setRunning(false);
      }
    }).then((fn) => {
      unlisten = fn;
      unlistenRef.current = fn;
    });
    return () => { unlisten?.(); };
  }, []);

  const handleStart = async () => {
    if (!pdfPath) return message.warning('请先选择加密的 PDF 文件');
    if (mode === 'charset' && charsetKeys.length === 0 && !customCharset)
      return message.warning('请至少选择一种字符集');
    if (mode === 'dict' && !dictPath) return message.warning('请选择字典文件');

    setRunning(true);
    setProgress(null);
    setResult(null);

    const params = JSON.stringify({
      pdf_path: pdfPath,
      mode,
      charset_keys: charsetKeys,
      custom_charset: customCharset,
      min_len: minLen,
      max_len: maxLen,
      dict_path: dictPath || null,
      num_workers: workers,
    });

    try {
      await invoke('pdf_bruteforce', { params });
    } catch (err) {
      message.error(String(err));
      setRunning(false);
    }
  };

  const handleCancel = async () => {
    await invoke('pdf_bruteforce_cancel', { params: '{}' }).catch(() => {});
    setRunning(false);
    setProgress(null);
  };

  const fmtSeconds = (s?: number) => {
    if (!s || s < 0) return '—';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
    return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
  };

  const percent = progress && progress.total
    ? Math.min(99, Math.round((progress.tried! / progress.total) * 100))
    : 0;

  const estimateTotalCandidates = () => {
    const charLen = charsetKeys.reduce(
      (acc, k) => acc + ({ digits: 10, lower: 26, upper: 26, symbols: 28 }[k] ?? 0), 0
    ) + (customCharset?.length ?? 0);
    if (charLen === 0) return '—';
    let total = 0;
    for (let l = minLen; l <= maxLen; l++) total += Math.pow(charLen, l);
    if (total > 1e12) return `~${(total / 1e12).toFixed(1)}万亿`;
    if (total > 1e9) return `~${(total / 1e9).toFixed(1)}十亿`;
    if (total > 1e6) return `~${(total / 1e6).toFixed(1)}百万`;
    if (total > 1e3) return `~${(total / 1e3).toFixed(1)}千`;
    return String(total);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Alert
        type="info"
        showIcon
        message="利用 Python multiprocessing 多进程并行 + CPU SIMD 指令加速 (hashlib/OpenSSL)，自动使用全部 CPU 核心"
      />

      {/* File Selection */}
      <Dragger
        accept=".pdf"
        maxCount={1}
        beforeUpload={(f) => { setPdfPath((f as any).path || f.name); return false; }}
      >
        <p className="ant-upload-hint">点击或拖拽加密 PDF 文件</p>
        {pdfPath && <Text type="secondary">{pdfPath.split('/').pop()}</Text>}
      </Dragger>

      {/* Mode Tabs */}
      <Tabs
        activeKey={mode}
        onChange={(k) => setMode(k as 'charset' | 'dict')}
        items={[
          {
            key: 'charset',
            label: '字符集穷举',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>字符集选择：</Text>
                <Checkbox.Group
                  value={charsetKeys}
                  onChange={(vals) => setCharsetKeys(vals as string[])}
                >
                  <Row gutter={[8, 8]}>
                    {CHARSET_OPTIONS.map((opt) => (
                      <Col span={12} key={opt.value}>
                        <Checkbox value={opt.value}>
                          {opt.label}
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                            ({opt.example.slice(0, 12)}{opt.example.length > 12 ? '…' : ''})
                          </Text>
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                </Checkbox.Group>
                <Space>
                  <Text>自定义追加字符：</Text>
                  <Input
                    style={{ width: 200 }}
                    value={customCharset}
                    onChange={(e) => setCustomCharset(e.target.value)}
                    placeholder="如 _- 或其他特殊字符"
                  />
                </Space>
                <Row gutter={16} align="middle">
                  <Col>
                    <Space>
                      <Text>最小长度：</Text>
                      <InputNumber min={1} max={12} value={minLen}
                        onChange={(v) => setMinLen(v ?? 1)} style={{ width: 70 }} />
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <Text>最大长度：</Text>
                      <InputNumber min={1} max={12} value={maxLen}
                        onChange={(v) => setMaxLen(v ?? 4)} style={{ width: 70 }} />
                    </Space>
                  </Col>
                  <Col>
                    <Tag color="blue">预估组合数: {estimateTotalCandidates()}</Tag>
                  </Col>
                </Row>
              </Space>
            ),
          },
          {
            key: 'dict',
            label: '字典攻击',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  type="warning" showIcon
                  message="字典攻击：逐行读取字典文件中的密码尝试，适用于已知密码模式的场景"
                />
                <Dragger
                  accept=".txt,.lst,.dic"
                  maxCount={1}
                  beforeUpload={(f) => { setDictPath((f as any).path || f.name); return false; }}
                >
                  <p className="ant-upload-hint">点击或拖拽字典文件（.txt，每行一个密码）</p>
                  {dictPath && <Text type="secondary">{dictPath.split('/').pop()}</Text>}
                </Dragger>
              </Space>
            ),
          },
        ]}
      />

      {/* Workers */}
      <Space>
        <Text>并发进程数：</Text>
        <InputNumber
          min={0} max={64} value={workers}
          onChange={(v) => setWorkers(v ?? 0)}
          style={{ width: 80 }}
        />
        <Text type="secondary">（0 = 自动，使用全部 CPU 核心）</Text>
      </Space>

      <Divider />

      {/* Action Buttons */}
      <Space>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={running}
          onClick={handleStart}
          disabled={running}
          size="large"
        >
          开始破解
        </Button>
        {running && (
          <Button
            danger
            icon={<StopOutlined />}
            onClick={handleCancel}
            size="large"
          >
            停止
          </Button>
        )}
      </Space>

      {/* Progress */}
      {running && progress && (
        <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
          <Row gutter={24}>
            <Col span={6}>
              <Statistic title="已尝试" value={progress.tried?.toLocaleString()} suffix={`/ ${progress.total?.toLocaleString()}`} />
            </Col>
            <Col span={6}>
              <Statistic title="速度" value={progress.speed?.toLocaleString()} suffix="次/秒" />
            </Col>
            <Col span={6}>
              <Statistic title="已用时" value={fmtSeconds(progress.elapsed)} />
            </Col>
            <Col span={6}>
              <Statistic title="预计剩余" value={fmtSeconds(progress.eta)} />
            </Col>
          </Row>
          <Progress
            percent={percent}
            status="active"
            strokeColor={{ from: '#108ee9', to: '#87d068' }}
            style={{ marginTop: 12 }}
          />
        </Card>
      )}

      {running && !progress && (
        <Card size="small">
          <Text>正在初始化并行进程...</Text>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card
          size="small"
          style={{
            background: result.type === 'found' ? '#f6ffed' : result.type === 'error' ? '#fff2f0' : '#fafafa',
            borderColor: result.type === 'found' ? '#b7eb8f' : result.type === 'error' ? '#ffccc7' : '#d9d9d9',
          }}
        >
          {result.type === 'found' && (
            <Space direction="vertical">
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                <Text strong style={{ color: '#52c41a', fontSize: 16 }}>密码已找到！</Text>
              </Space>
              <Space>
                <Text>密码：</Text>
                <Tag
                  color="success"
                  style={{ fontSize: 18, padding: '4px 16px', letterSpacing: 2 }}
                >
                  {result.password}
                </Tag>
                <Button
                  size="small"
                  onClick={() => {
                    navigator.clipboard.writeText(result.password || '');
                    message.success('已复制到剪贴板');
                  }}
                >
                  复制
                </Button>
              </Space>
              <Text type="secondary">
                共尝试 {result.tried?.toLocaleString()} 次，用时 {fmtSeconds(result.elapsed)}
              </Text>
            </Space>
          )}
          {result.type === 'done' && (
            <Space>
              <CloseCircleOutlined style={{ color: '#faad14', fontSize: 20 }} />
              <Text>
                未找到密码。共尝试 {result.tried?.toLocaleString()} 次，用时 {fmtSeconds(result.elapsed)}。
                请尝试扩大字符集或增加最大长度。
              </Text>
            </Space>
          )}
          {result.type === 'error' && (
            <Space>
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
              <Text type="danger">错误：{result.error}</Text>
            </Space>
          )}
        </Card>
      )}
    </Space>
  );
};

export default BruteforcePanel;
