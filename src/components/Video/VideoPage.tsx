import React, { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Input, Progress, Select, Space, Tag, Typography, Upload, message } from 'antd';
import { PlayCircleOutlined, StopOutlined, PlaySquareOutlined } from '@ant-design/icons';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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

const VIDEO_FORMATS = [
  '3gp', '3gpp', 'avi', 'bik', 'flv', 'gif', 'm4v', 'mkv', 'mp4',
  'mpg', 'mpeg', 'mov', 'ogv', 'rm', 'ts', 'vob', 'webm', 'wmv',
];

const VIDEO_INPUT_ACCEPT = VIDEO_FORMATS.map((fmt) => `.${fmt}`).join(',');
const VIDEO_OUTPUT_OPTIONS = VIDEO_FORMATS.map((fmt) => ({ value: fmt, label: fmt.toUpperCase() }));

const VIDEO_CODEC_OPTIONS = [
  'auto', 'libx264', 'libx265', 'libvpx', 'libvpx-vp9', 'mpeg4', 'mpeg2video',
  'wmv2', 'flv', 'mjpeg', 'libtheora', 'h263', 'gif', 'binkvideo',
].map((v) => ({ value: v, label: v }));

const AUDIO_CODEC_OPTIONS = [
  'auto', 'aac', 'libopus', 'libvorbis', 'libmp3lame', 'ac3', 'mp2', 'wmav2',
  'pcm_s16le', 'copy', 'none',
].map((v) => ({ value: v, label: v }));

const PRESET_OPTIONS = [
  'ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow',
].map((v) => ({ value: v, label: v }));

const RESOLUTION_OPTIONS = [
  { value: '', label: 'Source' },
  { value: '640x360', label: '640x360' },
  { value: '854x480', label: '854x480' },
  { value: '1280x720', label: '1280x720' },
  { value: '1920x1080', label: '1920x1080' },
  { value: '2560x1440', label: '2560x1440' },
  { value: '3840x2160', label: '3840x2160' },
];

type VideoBatchProgressEvent = {
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

type VideoCapabilities = {
  input_formats?: string[];
  output_formats?: string[];
  video_codec_options?: string[];
  audio_codec_options?: string[];
  preset_options?: string[];
  available_video_encoders?: string[];
  available_audio_encoders?: string[];
  target_constraints?: Record<string, { video_codecs?: string[]; audio_codecs?: string[] }>;
};

type ProbeSummary = {
  format?: string;
  duration?: number;
  size?: number;
  bit_rate?: number;
  video_codec?: string;
  audio_codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  has_audio?: boolean;
  streams?: number;
};

const VideoPage: React.FC = () => {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  const [file, setFile] = useState('');
  const [files, setFiles] = useState<string[]>([]);

  const [targetFormat, setTargetFormat] = useState('mp4');
  const [resolution, setResolution] = useState('');
  const [fps, setFps] = useState('0');
  const [videoBitrate, setVideoBitrate] = useState('2500k');
  const [audioBitrate, setAudioBitrate] = useState('128k');
  const [videoCodec, setVideoCodec] = useState('auto');
  const [audioCodec, setAudioCodec] = useState('auto');
  const [preset, setPreset] = useState('medium');

  const [outputFile, setOutputFile] = useState('');
  const [outputDir, setOutputDir] = useState('');

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<VideoBatchProgressEvent | null>(null);
  const [batchSummary, setBatchSummary] = useState<VideoBatchProgressEvent | null>(null);

  const [capabilities, setCapabilities] = useState<VideoCapabilities | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeSummary, setProbeSummary] = useState<ProbeSummary | null>(null);

  const fileBaseName = (path: string) => path.split('/').pop() || path;

  const SelectedFileTag = ({ path }: { path: string }) => (
    path ? <Tag className="pdf-selected-file">{t('common.selectedFile')}: {fileBaseName(path)}</Tag> : null
  );

  useEffect(() => {
    invokeCmd<PyResult & VideoCapabilities>('video_supported_formats', {})
      .then((result) => {
        if (!result.success) return;
        setCapabilities(result as VideoCapabilities);
      })
      .catch(() => {
        setCapabilities(null);
      });
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<VideoBatchProgressEvent>('video_convert_progress', (event) => {
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
            `${t('common.success')}: ${t('video.batchSummary', {
              success: data.success_count ?? 0,
              fail: data.fail_count ?? 0,
            })}`,
          );
        } else {
          message.error(`${t('common.error')}: ${t('video.batchNoSuccess')}`);
        }
        return;
      }

      setBatchRunning(false);
      setBatchProgress(data);
      setBatchSummary(data);
      message.error(`${t('common.error')}: ${data.error || t('video.errorGeneric')}`);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [t]);

  useEffect(() => {
    if (targetFormat === 'gif' && audioCodec !== 'none') {
      setAudioCodec('none');
    }
  }, [targetFormat, audioCodec]);

  const availableVideoEncoders = new Set(capabilities?.available_video_encoders || []);
  const availableAudioEncoders = new Set(capabilities?.available_audio_encoders || []);
  const targetConstraint = capabilities?.target_constraints?.[targetFormat] || {};

  const isVideoCodecDisabled = (value: string) => {
    if (value === 'auto') return false;

    const constrained = targetConstraint.video_codecs;
    if (constrained?.length && !constrained.includes(value)) return true;

    if (availableVideoEncoders.size > 0 && !availableVideoEncoders.has(value)) return true;
    return false;
  };

  const isAudioCodecDisabled = (value: string) => {
    if (value === 'auto') return false;

    if (targetFormat === 'gif') return value !== 'none';

    const constrained = targetConstraint.audio_codecs;
    if (constrained?.length && !constrained.includes(value)) return true;

    if (value === 'none' || value === 'copy') return false;
    if (availableAudioEncoders.size > 0 && !availableAudioEncoders.has(value)) return true;
    return false;
  };

  useEffect(() => {
    if (isVideoCodecDisabled(videoCodec)) {
      setVideoCodec('auto');
    }

    if (isAudioCodecDisabled(audioCodec)) {
      setAudioCodec(targetFormat === 'gif' ? 'none' : 'auto');
    }
  }, [targetFormat, capabilities, videoCodec, audioCodec]);

  const parseFps = () => {
    const parsed = Number.parseFloat((fps || '0').trim());
    if (!Number.isFinite(parsed) || parsed < 0) return NaN;
    return parsed;
  };

  const buildParams = () => {
    const params: Record<string, unknown> = {
      target_format: targetFormat,
      resolution,
      fps: parseFps(),
      video_bitrate: videoBitrate.trim(),
      audio_bitrate: audioBitrate.trim(),
      video_codec: videoCodec,
      audio_codec: audioCodec,
      preset,
    };

    return params;
  };

  const handleCancelBatch = async () => {
    await invoke('video_convert_batch_cancel', {}).catch(() => {});
    setBatchRunning(false);
    message.info(t('video.batchCancelled'));
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  };

  const formatDuration = (seconds: number) => {
    const sec = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleProbeInfo = async () => {
    if (!file) {
      message.warning(t('video.needSingleFile'));
      return;
    }

    setProbeLoading(true);
    try {
      const result = await invokeCmd<PyResult & { summary?: ProbeSummary }>('video_probe_info', { input_file: file });
      if (!result.success) {
        message.error(`${t('common.error')}: ${result.error || t('video.errorGeneric')}`);
        return;
      }

      const summary = (result.summary || {}) as ProbeSummary;
      setProbeSummary(summary);
      message.success(t('video.probeSuccess'));
    } finally {
      setProbeLoading(false);
    }
  };

  const handleConvert = async () => {
    if (mode === 'single' && !file) {
      message.warning(t('video.needSingleFile'));
      return;
    }
    if (mode === 'batch' && !files.length) {
      message.warning(t('video.needBatchFiles'));
      return;
    }

    const fpsNum = parseFps();
    if (Number.isNaN(fpsNum)) {
      message.warning(t('video.invalidFps'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'single') {
        const params: Record<string, unknown> = {
          ...buildParams(),
          input_file: file,
          fps: fpsNum,
        };
        if (outputFile.trim()) params.output_file = outputFile.trim();

        const result = await invokeCmd<PyResult>('video_convert', params);
        if (result.success) {
          message.success(`${t('common.success')}: ${result.output}`);
        } else {
          message.error(`${t('common.error')}: ${result.error || t('video.errorGeneric')}`);
        }
        return;
      }

      const params: Record<string, unknown> = {
        ...buildParams(),
        input_files: files,
        fps: fpsNum,
      };
      if (outputDir.trim()) params.output_dir = outputDir.trim();

      setBatchSummary(null);
      setBatchProgress({ type: 'start', index: 0, total: files.length, success_count: 0, fail_count: 0 });
      setBatchRunning(true);
      await invoke('video_convert_batch_stream', { params: JSON.stringify(params) });
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
          <div className="tool-panel-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
            <PlaySquareOutlined />
          </div>
          <div>
            <div className="tool-panel-title">{t('video.title')}</div>
          </div>
        </div>

        <div className="tool-panel-body">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert message={t('video.directionNote')} type="info" showIcon />

            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('video.mode')}</Text>
              <Select
                value={mode}
                onChange={(v) => setMode(v)}
                style={{ minWidth: 220 }}
                options={[
                  { value: 'single', label: t('video.modeSingle') },
                  { value: 'batch', label: t('video.modeBatch') },
                ]}
              />
            </Space>

            {mode === 'single' ? (
              <div className="pdf-file-block">
                <div
                  onClick={async () => {
                    const picked = await pickSinglePath({
                      title: t('common.selectFile'),
                      filters: [{ name: 'video', extensions: VIDEO_FORMATS }],
                    });
                    if (!picked) return;
                    setFile(picked);
                    setProbeSummary(null);
                    message.success(`${t('common.success')}: ${picked}`);
                  }}
                >
                  <Dragger
                    accept={VIDEO_INPUT_ACCEPT}
                    maxCount={1}
                    openFileDialogOnClick={false}
                    beforeUpload={async (f) => {
                      const p = await ensureSingleLocalPath(f, {
                        title: t('common.selectFile'),
                        filters: [{ name: 'video', extensions: VIDEO_FORMATS }],
                      });
                      if (!p) {
                        message.error(t('common.filePathUnavailable'));
                        return Upload.LIST_IGNORE;
                      }
                      setFile(p);
                      setProbeSummary(null);
                      return false;
                    }}
                  >
                    <p className="ant-upload-hint">{t('common.dragHint')}</p>
                    <Text type="secondary">{t('common.supportedFormats')}: {VIDEO_INPUT_ACCEPT}</Text>
                  </Dragger>
                </div>
                <div className="pdf-file-selected-slot">
                  <SelectedFileTag path={file} />
                </div>
              </div>
            ) : (
              <div className="pdf-file-block">
                <div
                  onClick={async () => {
                    const picked = await pickMultiplePaths({
                      title: t('common.selectFiles'),
                      filters: [{ name: 'video', extensions: VIDEO_FORMATS }],
                    });
                    if (!picked.length) return;
                    setFiles((prev) => [...prev, ...picked]);
                    message.success(`${t('common.success')}: +${picked.length}`);
                  }}
                >
                  <Dragger
                    multiple
                    accept={VIDEO_INPUT_ACCEPT}
                    openFileDialogOnClick={false}
                    beforeUpload={async (f) => {
                      const paths = await ensureMultipleLocalPaths(f, {
                        title: t('common.selectFiles'),
                        filters: [{ name: 'video', extensions: VIDEO_FORMATS }],
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
                    <Text type="secondary">{t('common.supportedFormats')}: {VIDEO_INPUT_ACCEPT}</Text>
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
            )}

            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t('video.targetFormat')}</Text>
              <Select
                value={targetFormat}
                onChange={(v) => setTargetFormat(v)}
                style={{ minWidth: 220 }}
                options={VIDEO_OUTPUT_OPTIONS}
              />
            </Space>

            <Alert
              message={t('video.codecHint', {
                video: capabilities?.available_video_encoders?.length ?? 0,
                audio: capabilities?.available_audio_encoders?.length ?? 0,
              })}
              type="warning"
              showIcon
            />

            <Space style={{ width: '100%' }} wrap>
              <Space>
                <Text>{t('video.resolution')}</Text>
                <Select
                  value={resolution}
                  onChange={(v) => setResolution(v)}
                  style={{ minWidth: 140 }}
                  options={RESOLUTION_OPTIONS}
                />
              </Space>
              <Space>
                <Text>{t('video.fps')}</Text>
                <Input
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                  placeholder="0"
                  style={{ width: 100 }}
                />
              </Space>
              <Space>
                <Text>{t('video.videoBitrate')}</Text>
                <Input
                  value={videoBitrate}
                  onChange={(e) => setVideoBitrate(e.target.value)}
                  placeholder="2500k"
                  style={{ width: 120 }}
                />
              </Space>
              <Space>
                <Text>{t('video.audioBitrate')}</Text>
                <Input
                  value={audioBitrate}
                  onChange={(e) => setAudioBitrate(e.target.value)}
                  placeholder="128k"
                  style={{ width: 120 }}
                  disabled={audioCodec === 'none'}
                />
              </Space>
            </Space>

            <Space style={{ width: '100%' }} wrap>
              <Space>
                <Text>{t('video.videoCodec')}</Text>
                <Select
                  value={videoCodec}
                  onChange={(v) => setVideoCodec(v)}
                  style={{ minWidth: 170 }}
                  options={VIDEO_CODEC_OPTIONS.map((item) => ({
                    ...item,
                    disabled: isVideoCodecDisabled(item.value),
                  }))}
                />
              </Space>
              <Space>
                <Text>{t('video.audioCodec')}</Text>
                <Select
                  value={audioCodec}
                  onChange={(v) => setAudioCodec(v)}
                  style={{ minWidth: 170 }}
                  options={AUDIO_CODEC_OPTIONS.map((item) => ({
                    ...item,
                    disabled: isAudioCodecDisabled(item.value),
                  }))}
                  disabled={targetFormat === 'gif'}
                />
              </Space>
              <Space>
                <Text>{t('video.preset')}</Text>
                <Select
                  value={preset}
                  onChange={(v) => setPreset(v)}
                  style={{ minWidth: 140 }}
                  options={PRESET_OPTIONS}
                />
              </Space>
            </Space>

            {mode === 'single' ? (
              <OutputPathInput value={outputFile} onChange={setOutputFile} mode="file" ext={targetFormat} />
            ) : (
              <OutputPathInput value={outputDir} onChange={setOutputDir} mode="dir" />
            )}

            <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleConvert}>
              {t('video.startConvert')}
            </Button>

            {mode === 'single' && (
              <Button loading={probeLoading} onClick={handleProbeInfo}>
                {t('video.probeInfo')}
              </Button>
            )}

            {mode === 'single' && probeSummary && (
              <Alert
                showIcon
                type="info"
                message={t('video.probeResult')}
                description={(
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label={t('video.probeFormat')}>{probeSummary.format || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('video.probeDuration')}>{formatDuration(Number(probeSummary.duration || 0))}</Descriptions.Item>
                    <Descriptions.Item label={t('video.probeResolution')}>
                      {(probeSummary.width || 0) > 0 && (probeSummary.height || 0) > 0
                        ? `${probeSummary.width}x${probeSummary.height}`
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('video.probeFps')}>{probeSummary.fps || 0}</Descriptions.Item>
                    <Descriptions.Item label={t('video.videoCodec')}>{probeSummary.video_codec || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('video.audioCodec')}>{probeSummary.audio_codec || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('video.probeBitrate')}>
                      {probeSummary.bit_rate ? `${Math.round(probeSummary.bit_rate / 1000)} kbps` : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('video.probeSize')}>{formatSize(Number(probeSummary.size || 0))}</Descriptions.Item>
                    <Descriptions.Item label={t('video.probeStreams')}>{probeSummary.streams || 0}</Descriptions.Item>
                  </Descriptions>
                )}
              />
            )}

            {mode === 'batch' && batchRunning && (
              <Button type="primary" danger icon={<StopOutlined />} onClick={handleCancelBatch}>
                {t('video.batchCancel')}
              </Button>
            )}

            {mode === 'batch' && batchProgress && (
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Progress percent={batchPercent} status={batchRunning ? 'active' : 'normal'} />
                <Text>
                  {t('video.batchProgressLine', {
                    current: batchProgress.index ?? 0,
                    total: batchProgress.total ?? 0,
                    success: batchProgress.success_count ?? 0,
                    fail: batchProgress.fail_count ?? 0,
                  })}
                </Text>
                {batchProgress.input && (
                  <Text type="secondary">
                    {t('video.batchCurrentFile')}: {fileBaseName(batchProgress.input)}
                  </Text>
                )}
              </Space>
            )}

            {mode === 'batch' && batchSummary && batchSummary.type === 'done' && (
              <Alert
                showIcon
                type={batchSummary.success ? 'success' : 'warning'}
                message={t('video.batchSummary', {
                  success: batchSummary.success_count ?? 0,
                  fail: batchSummary.fail_count ?? 0,
                })}
                description={batchSummary.output ? `${t('common.outputPath')}: ${batchSummary.output}` : undefined}
              />
            )}
          </Space>
        </div>
      </div>
    </div>
  );
};

export default VideoPage;
