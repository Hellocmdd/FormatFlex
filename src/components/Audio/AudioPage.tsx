import React, { useEffect, useState } from 'react';
import { Upload, Button, message, Typography, Space, Alert, Select, Tag, Progress } from 'antd';
import { PlayCircleOutlined, StopOutlined, SoundOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';
import {
  ensureMultipleLocalPaths,
  ensureSingleLocalPath,
  pickMultiplePaths,
  pickSinglePath,
} from '../../utils/filePicker';
import OutputPathInput from '../common/OutputPathInput';
import UnlockPanel from './UnlockPanel';

const { Text } = Typography;
const { Dragger } = Upload;

const AUDIO_INPUT_ACCEPT = '.3gp,.3gpp,.aac,.aiff,.ape,.avi,.bik,.cda,.flac,.flv,.gif,.m4v,.mkv,.mp4,.m4a,.m4b,.mp3,.mpg,.mpeg,.mov,.oga,.ogg,.ogv,.opus,.rm,.ts,.vob,.wav,.webm,.wma,.wmv';
const AUDIO_OUTPUT_OPTIONS = [
  '3gp', '3gpp', 'aac', 'aiff', 'ape', 'flac', 'm4a', 'm4b',
  'mp3', 'oga', 'ogg', 'opus', 'rm', 'wav', 'wma',
].map((fmt) => ({ value: fmt, label: fmt.toUpperCase() }));

const AUDIO_PRESET_MAP: Record<string, { bitrate: string; sampleRate: number; channels: number }> = {
  voice: { bitrate: '96k', sampleRate: 22050, channels: 1 },
  music: { bitrate: '192k', sampleRate: 44100, channels: 2 },
  hifi: { bitrate: '320k', sampleRate: 48000, channels: 2 },
};

type AudioBatchProgressEvent = {
  type: 'start' | 'progress' | 'done' | 'error';
  index?: number;
  total?: number;
  input?: string;
  output?: string;
  output_file?: string;
  outputs?: string[];
  success?: boolean;
  success_count?: number;
  fail_count?: number;
  errors?: Array<{ input?: string; error?: string }>;
  error?: string;
};

const AudioPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [file, setFile] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [targetFormat, setTargetFormat] = useState('mp3');
  const [preset, setPreset] = useState<'custom' | 'voice' | 'music' | 'hifi'>('custom');
  const [bitrate, setBitrate] = useState('192k');
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [channels, setChannels] = useState<number>(2);
  const [outputFile, setOutputFile] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<AudioBatchProgressEvent | null>(null);
  const [batchSummary, setBatchSummary] = useState<AudioBatchProgressEvent | null>(null);

  const fileBaseName = (path: string) => path.split('/').pop() || path;

  const SelectedFileTag = ({ path }: { path: string }) => (
    path ? <Tag className="pdf-selected-file">{t('common.selectedFile')}: {fileBaseName(path)}</Tag> : null
  );

  const formatAudioError = (rawError?: string) => {
    const err = (rawError || '').trim();
    if (!err) return t('audio.errorGeneric');

    const normalized = err.toLowerCase();
    if (
      normalized.includes('no audio stream')
      || normalized.includes('no decodable audio stream')
      || normalized.includes('output file does not contain any stream')
    ) {
      return t('audio.errorNoAudioStream');
    }

    return err;
  };

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<AudioBatchProgressEvent>('audio_convert_progress', (event) => {
      const data = event.payload;
      if (data.type === 'start' || data.type === 'progress') {
        setBatchProgress(data);
        return;
      }

      if (data.type === 'done') {
        setBatchRunning(false);
        setBatchProgress(data);
        setBatchSummary(data);
        if (data.success) {
          message.success(
            `${t('common.success')}: ${t('audio.batchSummary', {
              success: data.success_count ?? 0,
              fail: data.fail_count ?? 0,
            })}`,
          );
        } else {
          message.error(`${t('common.error')}: ${t('audio.batchNoSuccess')}`);
        }
        return;
      }

      if (data.type === 'error') {
        setBatchRunning(false);
        setBatchProgress(data);
        setBatchSummary(data);
        message.error(`${t('common.error')}: ${formatAudioError(data.error)}`);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [t]);

  const applyPreset = (name: 'custom' | 'voice' | 'music' | 'hifi') => {
    setPreset(name);
    if (name === 'custom') return;
    const cfg = AUDIO_PRESET_MAP[name];
    if (!cfg) return;
    setBitrate(cfg.bitrate);
    setSampleRate(cfg.sampleRate);
    setChannels(cfg.channels);
  };

  const handleCancelBatch = async () => {
    await invoke('audio_convert_batch_cancel', {}).catch(() => {});
    setBatchRunning(false);
    message.info(t('audio.batchCancelled'));
  };

  const handleConvert = async () => {
    if (mode === 'single' && !file) {
      message.warning(t('audio.needSingleFile'));
      return;
    }
    if (mode === 'batch' && !files.length) {
      message.warning(t('audio.needBatchFiles'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'single') {
        const params: Record<string, unknown> = {
          input_file: file,
          target_format: targetFormat,
          preset,
          bitrate,
          sample_rate: Number(sampleRate || 0),
          channels: Number(channels || 0),
        };
        if (outputFile.trim()) params.output_file = outputFile.trim();
        const result = await invokeCmd<PyResult>('convert_audio', params);
        if (result.success) message.success(`${t('common.success')}: ${result.output}`);
        else message.error(`${t('common.error')}: ${formatAudioError(result.error)}`);
        return;
      }

      const params: Record<string, unknown> = {
        input_files: files,
        target_format: targetFormat,
        preset,
        bitrate,
        sample_rate: Number(sampleRate || 0),
        channels: Number(channels || 0),
      };
      if (outputDir.trim()) params.output_dir = outputDir.trim();
      setBatchSummary(null);
      setBatchProgress({ type: 'start', index: 0, total: files.length, success_count: 0, fail_count: 0 });
      setBatchRunning(true);
      await invoke('audio_convert_batch_stream', { params: JSON.stringify(params) });
    } finally {
      setLoading(false);
    }
  };

  const batchPercent = (() => {
    if (!batchProgress?.total || batchProgress.total <= 0) return 0;
    const current = Number(batchProgress.index || 0);
    return Math.min(100, Math.round((current / batchProgress.total) * 100));
  })();

  return (
    <div className="tool-page">
      <div className="tool-panel" style={{ width: '100%' }}>
        <div className="tool-panel-header">
          <div className="tool-panel-icon" style={{ background: 'rgba(236,72,153,0.12)', color: '#EC4899' }}>
            <SoundOutlined />
          </div>
          <div>
            <div className="tool-panel-title">{t('audio.title')}</div>
          </div>
        </div>

        <div className="tool-panel-body">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert message={t('audio.directionNote')} type="info" showIcon />

            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('audio.mode')}</Text>
              <Select
                value={mode}
                onChange={(v) => setMode(v)}
                style={{ minWidth: 220 }}
                options={[
                  { value: 'single', label: t('audio.modeSingle') },
                  { value: 'batch', label: t('audio.modeBatch') },
                ]}
              />
            </Space>

            {mode === 'single' ? (
              <div className="pdf-file-block">
                <div onClick={async () => {
                    const picked = await pickSinglePath({
                      title: t('common.selectFile'),
                      filters: [{ name: 'media', extensions: AUDIO_INPUT_ACCEPT.replace(/\./g, '').split(',') }],
                    });
                    if (!picked) return;
                    setFile(picked);
                    message.success(`${t('common.success')}: ${picked}`);
                  }}>
                  <Dragger accept={AUDIO_INPUT_ACCEPT} maxCount={1} openFileDialogOnClick={false}
                    beforeUpload={async (f) => {
                      const p = await ensureSingleLocalPath(f, {
                        title: t('common.selectFile'),
                        filters: [{ name: 'media', extensions: AUDIO_INPUT_ACCEPT.replace(/\./g, '').split(',') }],
                      });
                      if (!p) {
                        message.error(t('common.filePathUnavailable'));
                        return Upload.LIST_IGNORE;
                      }
                      setFile(p);
                      return false;
                    }}>
                    <p className="ant-upload-hint">{t('common.dragHint')}</p>
                    <Text type="secondary">{t('common.supportedFormats')}: {AUDIO_INPUT_ACCEPT}</Text>
                  </Dragger>
                </div>
                <div className="pdf-file-selected-slot">
                  <SelectedFileTag path={file} />
                </div>
              </div>
            ) : (
              <div className="pdf-file-block">
                <div onClick={async () => {
                    const picked = await pickMultiplePaths({
                      title: t('common.selectFiles'),
                      filters: [{ name: 'media', extensions: AUDIO_INPUT_ACCEPT.replace(/\./g, '').split(',') }],
                    });
                    if (!picked.length) return;
                    setFiles(prev => [...prev, ...picked]);
                    message.success(`${t('common.success')}: +${picked.length}`);
                  }}>
                  <Dragger multiple accept={AUDIO_INPUT_ACCEPT} openFileDialogOnClick={false}
                    beforeUpload={async (f) => {
                      const paths = await ensureMultipleLocalPaths(f, {
                        title: t('common.selectFiles'),
                        filters: [{ name: 'media', extensions: AUDIO_INPUT_ACCEPT.replace(/\./g, '').split(',') }],
                      });
                      if (!paths.length) {
                        message.error(t('common.filePathUnavailable'));
                        return Upload.LIST_IGNORE;
                      }
                      setFiles(prev => [...prev, ...paths]);
                      return false;
                    }}>
                    <p className="ant-upload-hint">{t('common.dragHint')}</p>
                    <Text type="secondary">{t('common.supportedFormats')}: {AUDIO_INPUT_ACCEPT}</Text>
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
            )}

            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('audio.targetFormat')}</Text>
              <Select
                value={targetFormat}
                onChange={(v) => setTargetFormat(v)}
                style={{ minWidth: 220 }}
                options={AUDIO_OUTPUT_OPTIONS}
              />
            </Space>

            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('audio.preset')}</Text>
              <Select
                value={preset}
                onChange={(v) => applyPreset(v)}
                style={{ minWidth: 220 }}
                options={[
                  { value: 'custom', label: t('audio.presetCustom') },
                  { value: 'voice', label: t('audio.presetVoice') },
                  { value: 'music', label: t('audio.presetMusic') },
                  { value: 'hifi', label: t('audio.presetHifi') },
                ]}
              />
            </Space>

            <Space style={{ width: '100%' }} wrap>
              <Space>
                <Text>{t('audio.bitrate')}</Text>
                <Select
                  value={bitrate}
                  onChange={(v) => setBitrate(v)}
                  style={{ minWidth: 120 }}
                  options={[
                    { value: '96k', label: '96k' },
                    { value: '128k', label: '128k' },
                    { value: '192k', label: '192k' },
                    { value: '256k', label: '256k' },
                    { value: '320k', label: '320k' },
                  ]}
                />
              </Space>
              <Space>
                <Text>{t('audio.sampleRate')}</Text>
                <Select
                  value={sampleRate}
                  onChange={(v) => setSampleRate(Number(v))}
                  style={{ minWidth: 120 }}
                  options={[
                    { value: 22050, label: '22050' },
                    { value: 32000, label: '32000' },
                    { value: 44100, label: '44100' },
                    { value: 48000, label: '48000' },
                  ]}
                />
              </Space>
              <Space>
                <Text>{t('audio.channels')}</Text>
                <Select
                  value={channels}
                  onChange={(v) => setChannels(Number(v))}
                  style={{ minWidth: 100 }}
                  options={[
                    { value: 1, label: 'Mono' },
                    { value: 2, label: 'Stereo' },
                  ]}
                />
              </Space>
            </Space>

            {mode === 'single' ? (
              <OutputPathInput value={outputFile} onChange={setOutputFile} mode="file" ext={targetFormat} />
            ) : (
              <OutputPathInput value={outputDir} onChange={setOutputDir} mode="dir" />
            )}

            <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleConvert}>
              {t('audio.startConvert')}
            </Button>

            {mode === 'batch' && batchRunning && (
              <Button type="primary" danger icon={<StopOutlined />} onClick={handleCancelBatch}>
                {t('audio.batchCancel')}
              </Button>
            )}

            {mode === 'batch' && batchProgress && (
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Progress percent={batchPercent} status={batchRunning ? 'active' : 'normal'} />
                <Text>
                  {t('audio.batchProgressLine', {
                    current: batchProgress.index ?? 0,
                    total: batchProgress.total ?? 0,
                    success: batchProgress.success_count ?? 0,
                    fail: batchProgress.fail_count ?? 0,
                  })}
                </Text>
                {batchProgress.input && (
                  <Text type="secondary">
                    {t('audio.batchCurrentFile')}: {fileBaseName(batchProgress.input)}
                  </Text>
                )}
              </Space>
            )}

            {mode === 'batch' && batchSummary && batchSummary.type === 'done' && (
              <Alert
                showIcon
                type={batchSummary.success ? 'success' : 'warning'}
                message={t('audio.batchSummary', {
                  success: batchSummary.success_count ?? 0,
                  fail: batchSummary.fail_count ?? 0,
                })}
                description={batchSummary.output ? `${t('common.outputPath')}: ${batchSummary.output}` : undefined}
              />
            )}
          </Space>
        </div>
      </div>

      <UnlockPanel />
    </div>
  );
};

export default AudioPage;
