/**
 * UnlockPanel — 统一音乐解锁面板
 * 支持：NCM/UC（网易云）/ KGM・KGMA・VPR・KGG（酷狗）/ KWM（酷我）/
 *        QMCv1・QMCv2（QQ 音乐）/ TM（QQ iOS）/ XM（虾米）/ MG3D（咪咕）
 * 参考 unlock-music 项目（MIT）的统一解锁思路进行重构。
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  message,
  Progress,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { PlayCircleOutlined, StopOutlined, UnlockOutlined } from '@ant-design/icons';
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

const { Text } = Typography;
const { Dragger } = Upload;

const ENCRYPTED_EXTENSIONS = [
  'ncm', 'uc', 'kgm', 'kgma', 'kgg', 'vpr', 'kwm',
  'qmc0', 'qmc2', 'qmc3', 'qmc4', 'qmc6', 'qmc8', 'qmcflac', 'qmcogg', 'tkm',
  'bkc', 'mflac', 'mflac0', 'mflac1', 'mgg', 'mgg0', 'mgg1', 'mggl', 'mggv', 'mmp4',
  'tm0', 'tm2', 'tm3', 'tm6', 'xm', 'x2m', 'x3m', 'mg3d', 'ofl_en',
];

// All encrypted formats this panel can decode
const UNLOCK_INPUT_ACCEPT =
  '.ncm,.uc,.kgm,.kgma,.kgg,.vpr,.kwm,.qmc0,.qmc2,.qmc3,.qmc4,.qmc6,.qmc8,.qmcflac,.qmcogg,.tkm,.bkc,.mflac,.mflac0,.mflac1,.mgg,.mgg0,.mgg1,.mggl,.mggv,.mmp4,.tm0,.tm2,.tm3,.tm6,.xm,.mg3d,.ofl_en';

const UNLOCK_OUTPUT_OPTIONS = [
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC' },
];

type UnlockProgressEvent = {
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

const UnlockPanel: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [file, setFile] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [targetFormat, setTargetFormat] = useState('mp3');
  const [outputFile, setOutputFile] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [kggKeyFile, setKggKeyFile] = useState('');
  const [kgDbFile, setKgDbFile] = useState('');
  const [kwmCoreKey, setKwmCoreKey] = useState('');
  const [jooxUuid, setJooxUuid] = useState('');
  const [singleError, setSingleError] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<UnlockProgressEvent | null>(null);
  const [batchSummary, setBatchSummary] = useState<UnlockProgressEvent | null>(null);

  const fileBaseName = (path: string) => path.split('/').pop() || path;

  const parseKggErrorDetails = (text: string) => {
    const msg = String(text || '');
    const hashMatch = msg.match(/audio hash:\s*([a-fA-F0-9]{32,64})/);
    const searchedMatch = msg.match(/Searched:\s*([\s\S]*)$/);
    return {
      hash: hashMatch ? hashMatch[1] : '',
      searched: searchedMatch ? searchedMatch[1].trim() : '',
    };
  };

  useEffect(() => {
    setJooxUuid(localStorage.getItem('joox_uuid') || '');

    let unlisten: UnlistenFn | undefined;
    listen<UnlockProgressEvent>('audio_unlock_progress', (event) => {
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
            `${t('common.success')}: ${t('audio.unlock.batchSummary', {
              success: data.success_count ?? 0,
              fail: data.fail_count ?? 0,
            })}`,
          );
        } else {
          message.error(`${t('common.error')}: ${t('audio.unlock.batchNoSuccess')}`);
        }
        return;
      }
      if (data.type === 'error') {
        setBatchRunning(false);
        setBatchProgress(data);
        setBatchSummary(data);
        message.error(`${t('common.error')}: ${data.error || t('audio.unlock.errorGeneric')}`);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => { if (unlisten) unlisten(); };
  }, [t]);

  const handleCancelBatch = async () => {
    await invoke('audio_unlock_batch_cancel', {}).catch(() => {});
    setBatchRunning(false);
    message.info(t('audio.unlock.batchCancelled'));
  };

  const handleUnlock = async () => {
    if (mode === 'single' && !file) {
      message.warning(t('audio.unlock.needSingleFile'));
      return;
    }
    if (mode === 'batch' && !files.length) {
      message.warning(t('audio.unlock.needBatchFiles'));
      return;
    }

    setLoading(true);
    setSingleError('');
    try {
      if (mode === 'single') {
        const params: Record<string, unknown> = {
          input_file: file,
          target_format: targetFormat,
        };
        if (outputFile.trim()) params.output_file = outputFile.trim();
        if (kggKeyFile.trim()) params.kgg_key_file = kggKeyFile.trim();
        if (kgDbFile.trim()) params.kg_db_file = kgDbFile.trim();
        if (kwmCoreKey.trim()) params.kwm_core_key = kwmCoreKey.trim();
        if (jooxUuid.trim()) params.joox_uuid = jooxUuid.trim();

        const result = await invokeCmd<PyResult>('audio_unlock', params);
        if (result.success) {
          message.success(`${t('common.success')}: ${result.output}`);
          if (result.warnings?.length) {
            message.warning(result.warnings.join('; '));
          }
        } else {
          const errText = String(result.error || t('audio.unlock.errorGeneric'));
          setSingleError(errText);
          message.error(`${t('common.error')}: ${errText}`);
        }
        return;
      }

      // batch
      const params: Record<string, unknown> = {
        input_files: files,
        target_format: targetFormat,
      };
      if (outputDir.trim()) params.output_dir = outputDir.trim();
      if (kggKeyFile.trim()) params.kgg_key_file = kggKeyFile.trim();
      if (kgDbFile.trim()) params.kg_db_file = kgDbFile.trim();
      if (kwmCoreKey.trim()) params.kwm_core_key = kwmCoreKey.trim();
      if (jooxUuid.trim()) params.joox_uuid = jooxUuid.trim();

      setBatchSummary(null);
      setBatchProgress({ type: 'start', index: 0, total: files.length, success_count: 0, fail_count: 0 });
      setBatchRunning(true);
      await invoke('audio_unlock_batch_stream', { params: JSON.stringify(params) });
    } finally {
      setLoading(false);
    }
  };

  const batchPercent = (() => {
    if (!batchProgress?.total || batchProgress.total <= 0) return 0;
    return Math.min(100, Math.round(((batchProgress.index ?? 0) / batchProgress.total) * 100));
  })();

  const kggErr = parseKggErrorDetails(singleError);

  return (
    <div className="tool-panel" style={{ width: '100%' }}>
      <div className="tool-panel-header">
        <div className="tool-panel-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#7C3AED' }}>
          <UnlockOutlined />
        </div>
        <div>
          <div className="tool-panel-title">{t('audio.unlock.title')}</div>
        </div>
      </div>

      <div className="tool-panel-body">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert message={t('audio.unlock.directionNote')} type="info" showIcon />

          {/* Mode selector */}
          <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text>{t('audio.unlock.mode')}</Text>
            <Select
              value={mode}
              onChange={(v) => setMode(v)}
              style={{ minWidth: 220 }}
              options={[
                { value: 'single', label: t('audio.unlock.modeSingle') },
                { value: 'batch', label: t('audio.unlock.modeBatch') },
              ]}
            />
          </Space>

          {/* File picker */}
          {mode === 'single' ? (
            <div className="pdf-file-block">
              <div onClick={async () => {
                const picked = await pickSinglePath({
                  title: t('common.selectFile'),
                  filters: [{ name: 'encrypted audio', extensions: ENCRYPTED_EXTENSIONS }],
                });
                if (!picked) return;
                setFile(picked);
              }}>
                <Dragger
                  accept={UNLOCK_INPUT_ACCEPT}
                  maxCount={1}
                  openFileDialogOnClick={false}
                  beforeUpload={async (f) => {
                    const p = await ensureSingleLocalPath(f, {
                      title: t('common.selectFile'),
                      filters: [{ name: 'encrypted audio', extensions: ENCRYPTED_EXTENSIONS }],
                    });
                    if (!p) { message.error(t('common.filePathUnavailable')); return Upload.LIST_IGNORE; }
                    setFile(p);
                    return false;
                  }}
                >
                  <p className="ant-upload-hint">{t('common.dragHint')}</p>
                  <Text type="secondary">{t('common.supportedFormats')}: {UNLOCK_INPUT_ACCEPT}</Text>
                </Dragger>
              </div>
              <div className="pdf-file-selected-slot">
                {file && <Tag className="pdf-selected-file">{t('common.selectedFile')}: {fileBaseName(file)}</Tag>}
              </div>
            </div>
          ) : (
            <div className="pdf-file-block">
              <div onClick={async () => {
                const picked = await pickMultiplePaths({
                  title: t('common.selectFiles'),
                  filters: [{ name: 'encrypted audio', extensions: ENCRYPTED_EXTENSIONS }],
                });
                if (!picked.length) return;
                setFiles(prev => [...prev, ...picked]);
                message.success(`${t('common.success')}: +${picked.length}`);
              }}>
                <Dragger
                  multiple
                  accept={UNLOCK_INPUT_ACCEPT}
                  openFileDialogOnClick={false}
                  beforeUpload={async (f) => {
                    const paths = await ensureMultipleLocalPaths(f, {
                      title: t('common.selectFiles'),
                      filters: [{ name: 'encrypted audio', extensions: ENCRYPTED_EXTENSIONS }],
                    });
                    if (!paths.length) { message.error(t('common.filePathUnavailable')); return Upload.LIST_IGNORE; }
                    setFiles(prev => [...prev, ...paths]);
                    return false;
                  }}
                >
                  <p className="ant-upload-hint">{t('common.dragHint')}</p>
                  <Text type="secondary">{t('common.supportedFormats')}: {UNLOCK_INPUT_ACCEPT}</Text>
                </Dragger>
              </div>
              <div className="pdf-file-selected-slot">
                {files.length > 0 && (
                  <Space wrap>
                    {files.map((f, i) => (
                      <Tag
                        key={`${f}-${i}`}
                        closable
                        onClose={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      >
                        {fileBaseName(f)}
                      </Tag>
                    ))}
                  </Space>
                )}
              </div>
            </div>
          )}

          {/* Target format */}
          <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text>{t('audio.unlock.targetFormat')}</Text>
            <Select
              value={targetFormat}
              onChange={(v) => setTargetFormat(v)}
              style={{ minWidth: 220 }}
              options={UNLOCK_OUTPUT_OPTIONS}
            />
          </Space>

          {/* KGG optional keys (only shown for KGG/KGM formats; harmless for others) */}
          <Input
            placeholder={t('audio.unlock.kgDbFileOptional')}
            value={kgDbFile}
            onChange={(e) => setKgDbFile(e.target.value)}
            addonAfter={
              <Button size="small" onClick={async () => {
                const picked = await pickSinglePath({
                  title: t('audio.unlock.selectKgDb'),
                  filters: [{ name: 'db', extensions: ['db'] }],
                });
                if (picked) setKgDbFile(picked);
              }}>
                {t('common.browse')}
              </Button>
            }
          />
          <Input
            placeholder={t('audio.unlock.kggKeyFileOptional')}
            value={kggKeyFile}
            onChange={(e) => setKggKeyFile(e.target.value)}
            addonAfter={
              <Button size="small" onClick={async () => {
                const picked = await pickSinglePath({
                  title: t('audio.unlock.selectKggKey'),
                  filters: [{ name: 'key', extensions: ['key'] }],
                });
                if (picked) setKggKeyFile(picked);
              }}>
                {t('common.browse')}
              </Button>
            }
          />

          <Input
            placeholder={t('audio.unlock.jooxUuidOptional')}
            value={jooxUuid}
            onChange={(e) => setJooxUuid(e.target.value)}
          />

          <Input
            placeholder={t('audio.unlock.kwmCoreKeyOptional')}
            value={kwmCoreKey}
            onChange={(e) => setKwmCoreKey(e.target.value)}
          />

          {/* Error display */}
          {singleError && (
            <Alert
              showIcon
              type="error"
              message={t('audio.unlock.errorGeneric')}
              description={(
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text type="danger">{singleError}</Text>
                  {kggErr.hash && (
                    <Text>{t('audio.unlock.detectedAudioHash', { hash: kggErr.hash })}</Text>
                  )}
                  {kggErr.searched && (
                    <Text type="secondary">
                      {t('audio.unlock.searchedPaths', { paths: kggErr.searched })}
                    </Text>
                  )}
                </Space>
              )}
            />
          )}

          {/* Output paths */}
          {mode === 'single' ? (
            <OutputPathInput value={outputFile} onChange={setOutputFile} mode="file" ext={targetFormat} />
          ) : (
            <OutputPathInput value={outputDir} onChange={setOutputDir} mode="dir" />
          )}

          {/* Action buttons */}
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={loading}
            onClick={handleUnlock}
            style={{ background: '#7C3AED', borderColor: '#7C3AED' }}
          >
            {t('audio.unlock.startUnlock')}
          </Button>

          {mode === 'batch' && batchRunning && (
            <Button type="primary" danger icon={<StopOutlined />} onClick={handleCancelBatch}>
              {t('audio.unlock.batchCancel')}
            </Button>
          )}

          {/* Batch progress */}
          {mode === 'batch' && batchProgress && (
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <Progress percent={batchPercent} status={batchRunning ? 'active' : 'normal'} />
              <Text>
                {t('audio.unlock.batchProgressLine', {
                  current: batchProgress.index ?? 0,
                  total: batchProgress.total ?? 0,
                  success: batchProgress.success_count ?? 0,
                  fail: batchProgress.fail_count ?? 0,
                })}
              </Text>
              {batchProgress.input && (
                <Text type="secondary">
                  {t('audio.unlock.batchCurrentFile')}: {fileBaseName(batchProgress.input)}
                </Text>
              )}
            </Space>
          )}

          {/* Batch summary */}
          {mode === 'batch' && batchSummary?.type === 'done' && (
            <Alert
              showIcon
              type={batchSummary.success ? 'success' : 'warning'}
              message={t('audio.unlock.batchSummary', {
                success: batchSummary.success_count ?? 0,
                fail: batchSummary.fail_count ?? 0,
              })}
              description={
                batchSummary.errors?.length
                  ? batchSummary.errors.map((e, i) => (
                    <div key={i}>
                      <Text type="secondary">{fileBaseName(e.input ?? '')}</Text>
                      {': '}
                      <Text type="danger">{e.error}</Text>
                    </div>
                  ))
                  : undefined
              }
            />
          )}
        </Space>
      </div>
    </div>
  );
};

export default UnlockPanel;
