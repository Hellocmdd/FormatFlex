import React, { useState } from 'react';
import { Card, Tabs, Upload, Button, Input, message, Typography, Space, Alert } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invokeCmd, PyResult } from '../../hooks/useInvoke';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const ConvertPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const makeTab = (
    key: string,
    titleKey: string,
    accept: string,
    cmd: string,
    buildParams: (file: string, output: string, extra?: unknown) => Record<string, unknown>,
    outputExt: string,
    extra?: React.ReactNode
  ) => {
    const TabContent = () => {
      const [file, setFile] = useState('');
      const [output, setOutput] = useState('');

      const handleConvert = async () => {
        if (!file) return message.warning('请选择文件');
        setLoading(true);
        try {
          const outPath = output || file.replace(/\.[^.]+$/, outputExt);
          const result = await invokeCmd<PyResult>(cmd, buildParams(file, outPath));
          if (result.success) {
            message.success(`${t('common.success')}: ${result.output || outPath}`);
          } else {
            message.error(`${t('common.error')}: ${result.error}`);
          }
        } finally {
          setLoading(false);
        }
      };

      return (
        <Space direction="vertical" style={{ width: '100%' }}>
          {extra}
          <Dragger
            accept={accept}
            maxCount={1}
            beforeUpload={(f) => { setFile((f as any).path || f.name); return false; }}
          >
            <p className="ant-upload-hint">{t('common.dragHint')}</p>
            <Text type="secondary">{t('common.supportedFormats')}: {accept}</Text>
          </Dragger>
          <Input
            placeholder={t('common.outputFile')}
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            addonAfter={outputExt}
          />
          <Button type="primary" icon={<SyncOutlined />} loading={loading} onClick={handleConvert}>
            {t(titleKey)}
          </Button>
        </Space>
      );
    };
    return { key, label: t(titleKey), children: <TabContent /> };
  };

  // Images to PDF tab needs multi-file support
  const ImagesToPdfTab = () => {
    const [files, setFiles] = useState<string[]>([]);
    const [output, setOutput] = useState('');

    const handleConvert = async () => {
      if (!files.length) return message.warning('请选择图片文件');
      if (!output) return message.warning('请指定输出路径');
      setLoading(true);
      try {
        const result = await invokeCmd<PyResult>('convert_images_to_pdf', {
          input_files: files, output_file: output,
        });
        if (result.success) {
          message.success(`${t('common.success')}: ${result.output}`);
        } else {
          message.error(result.error);
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Dragger
          multiple
          accept=".jpg,.jpeg,.png,.bmp,.tiff,.webp"
          beforeUpload={(f) => { setFiles(prev => [...prev, (f as any).path || f.name]); return false; }}
        >
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

  const libreNote = <Alert message={t('convert.libreofficeNote')} type="info" showIcon style={{ marginBottom: 8 }} />;

  const tabs = [
    makeTab('wordToPdf', 'convert.wordToPdf', '.docx,.doc', 'convert_word_to_pdf',
      (f, o) => ({ input_file: f, output_file: o }), '.pdf', libreNote),
    makeTab('excelToPdf', 'convert.excelToPdf', '.xlsx,.xls', 'convert_excel_to_pdf',
      (f, o) => ({ input_file: f, output_file: o }), '.pdf', libreNote),
    makeTab('pptxToPdf', 'convert.pptxToPdf', '.pptx,.ppt', 'convert_pptx_to_pdf',
      (f, o) => ({ input_file: f, output_file: o }), '.pdf', libreNote),
    makeTab('pdfToMarkdown', 'convert.pdfToMarkdown', '.pdf', 'convert_pdf_to_markdown',
      (f, o) => ({ input_file: f, output_file: o }), '.md'),
    { key: 'imagesToPdf', label: t('convert.imagesToPdf'), children: <ImagesToPdfTab /> },
    makeTab('htmlToPdf', 'convert.htmlToPdf', '.html,.htm', 'convert_html_to_pdf',
      (f, o) => ({ input_file: f, output_file: o }), '.pdf'),
    makeTab('excelToCsv', 'convert.excelToCsv', '.xlsx,.xls', 'convert_excel_to_csv',
      (f, o) => ({ input_file: f, output_dir: o.replace('.csv', '') }), '(dir)'),
  ];

  return (
    <Card>
      <Title level={4}><SyncOutlined /> {t('convert.title')}</Title>
      <Tabs items={tabs} />
    </Card>
  );
};

export default ConvertPage;
