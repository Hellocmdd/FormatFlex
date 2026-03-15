import React from 'react';
import { Button, Input, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { pickSinglePath, pickSavePath } from '../../utils/filePicker';

const { Text } = Typography;

interface OutputPathInputProps {
  value: string;
  onChange: (val: string) => void;
  /** 'file' = save-file dialog; 'dir' = directory picker */
  mode: 'file' | 'dir';
  /** File extension without leading dot (e.g. 'pdf'). Only used when mode='file'. */
  ext?: string;
  placeholder?: string;
  hint?: string;
  className?: string;
}

/**
 * Unified output-path input used across all pages.
 * mode='file' → opens a native Save File dialog.
 * mode='dir'  → opens a native Select Directory dialog.
 */
const OutputPathInput: React.FC<OutputPathInputProps> = ({
  value,
  onChange,
  mode,
  ext = '',
  placeholder,
  hint,
  className,
}) => {
  const { t } = useTranslation();

  const handleBrowse = async () => {
    if (mode === 'dir') {
      const picked = await pickSinglePath({
        title: t('common.selectOutputDir'),
        directory: true,
      });
      if (picked) onChange(picked);
    } else {
      const picked = await pickSavePath({
        title: t('common.selectOutputDir'),
        ...(ext ? { filters: [{ name: ext.toUpperCase(), extensions: [ext] }] } : {}),
      });
      if (picked) onChange(picked);
    }
  };

  const defaultPlaceholder =
    mode === 'dir' ? t('common.outputDirLabel') : t('common.outputPath');
  const defaultHint =
    mode === 'dir' ? t('common.outputDirHintMulti') : t('common.outputFileHint');

  return (
    <div className={`pdf-output-block${className ? ` ${className}` : ''}`}>
      <Input
        placeholder={placeholder ?? defaultPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        addonAfter={
          <Button size="small" onClick={handleBrowse}>
            {t('common.browse')}
          </Button>
        }
      />
      <Text className="pdf-output-hint pdf-output-hint-strong" type="warning">
        {hint ?? defaultHint}
      </Text>
    </div>
  );
};

export default OutputPathInput;
