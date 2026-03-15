# DocHub 文档处理工具

一款跨平台桌面文档处理工具，基于 Tauri 2 + React + TypeScript 构建，Python 驱动后端处理能力。

## 功能特性

### PDF 操作
- **合并 / 拆分**：多文件合并，按页面或范围拆分
- **加密 / 解密**：密码保护与解除保护
- **压缩**：减小文件体积
- **水印**：添加可自定义的文字水印
- **页码**：为每页插入页码
- **PDF 转 Word**：导出为可编辑的 `.docx`
- **暴力破解**：字典攻击恢复忘记的 PDF 密码（流式进度显示）

### 文档转换
| 源格式 | 目标格式 |
|---|---|
| Word (.docx) | PDF |
| Excel (.xlsx) | PDF / CSV |
| PowerPoint (.pptx) | PDF |
| PDF | Markdown |
| 音频/视频容器（3gp/3gpp/aac/aiff/ape/avi/bik/cda/flac/flv/gif/m4v/mkv/mp4/m4a/m4b/mp3/mpg/mpeg/mov/oga/ogg/ogv/opus/rm/ts/vob/wav/webm/wma/wmv） | 音频（3gp/3gpp/aac/aiff/ape/flac/m4a/m4b/mp3/oga/ogg/opus/rm/wav/wma） |
| 图片（JPG/PNG 等） | PDF |
| HTML | PDF |

> Word / Excel / PPT 转换需要安装 LibreOffice。
> 音频转换依赖 ffmpeg / ffprobe。

### 图片文字识别（OCR）
- **本地 Tesseract**：离线识别，支持中英文
- **GLM-OCR（云端）**：高精度版面识别（需配置 API Key）

## 开源借鉴与致谢

本项目在实现中借鉴了以下优秀开源项目，并基于当前架构（React -> Tauri -> Python）进行了工程化整合。

### 桌面与前端框架

- **[Tauri](https://tauri.app/)**
	- 用途：跨平台桌面壳，负责前端与 Rust/Python 处理链路桥接。
- **[Vite](https://vitejs.dev/)**
	- 用途：前端开发与构建工具，提供快速热更新与生产打包。
- **[React](https://react.dev/)**
	- 用途：前端 UI 框架。
- **[Ant Design](https://ant.design/)**
	- 用途：企业级组件库（表单、消息反馈、布局、主题切换）。
- **[i18next](https://www.i18next.com/) / [react-i18next](https://react.i18next.com/)**
	- 用途：中英文国际化与文案管理。
- **[react-markdown](https://github.com/remarkjs/react-markdown)**
	- 用途：Markdown 结果渲染（含 OCR 与转换输出展示）。

### 文档与多媒体处理

- **[pdf2docx](https://github.com/ArtifexSoftware/pdf2docx)**
	- 用途：PDF -> Word（.docx）核心转换能力。
- **[pypdf](https://github.com/py-pdf/pypdf)**
	- 用途：PDF 合并、拆分、加解密、元信息读取。
- **[pdfplumber](https://github.com/jsvine/pdfplumber)**
	- 用途：PDF 文本与版面提取（PDF -> Markdown 关键链路）。
- **[python-docx](https://github.com/python-openxml/python-docx)**
	- 用途：Word 文档读写。
- **[python-pptx](https://github.com/scanny/python-pptx)**
	- 用途：PPT 解析与转换辅助。
- **[openpyxl](https://foss.heptapod.net/openpyxl/openpyxl)**
	- 用途：Excel 读写与 CSV/Markdown 导出。
- **[WeasyPrint](https://weasyprint.org/)**
	- 用途：HTML -> PDF 渲染后端之一。
- **[ReportLab](https://www.reportlab.com/)**
	- 用途：PDF 绘制（如页码、水印相关处理）。
- **[Mutagen](https://github.com/quodlibet/mutagen)**
	- 用途：音频元信息读取与写回。
- **[libtakiyasha](https://github.com/nukemiko/libtakiyasha)**
	- 用途：多种加密音频格式解密链路。

### OCR 与 AI 服务

- **[Tesseract OCR](https://github.com/tesseract-ocr/tesseract)** + **[pytesseract](https://github.com/madmaze/pytesseract)**
	- 用途：本地离线 OCR。
- **[智谱 AI 开放平台](https://bigmodel.cn/)**
	- 用途：GLM OCR 云端识别能力（可选）。

说明：
- 我们评估过 **[doctr](https://github.com/mindee/doctr)**，当前版本未将其作为主转换链路依赖。
- 产品目标是“除云端 OCR 外可离线运行”，因此核心转换模块优先采用可本地部署方案。

## 环境要求

- Node.js ≥ 18
- Rust（通过 rustup 安装）
- Python 3.10+
- Tesseract OCR（本地 OCR 功能）
- LibreOffice（Office 文档转换功能）
- FFmpeg（音频转换功能）

## 快速开始

### 一键安装（Linux）

```bash
bash setup.sh
```

脚本会自动安装 Node.js（via nvm）、Rust（via rustup）、并安装核心系统依赖（Tesseract、LibreOffice、FFmpeg、Pandoc、wkhtmltopdf、XeLaTeX、Poppler）与 Python 虚拟环境。

### 手动安装

```bash
# 1. 安装系统依赖
sudo apt install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng
sudo apt install libreoffice   # Office 转换需要
sudo apt install ffmpeg        # 音频转换需要
sudo apt install pandoc wkhtmltopdf texlive-xetex poppler-utils

# 2. 配置 Python 虚拟环境
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

# 3. 安装 npm 依赖
npm install
```

### 启动开发模式

```bash
source ~/.cargo/env   # Rust 不在默认 PATH，每次新 shell 需要执行
npm run tauri dev
# 或使用快捷脚本
bash run.sh
```

前端热更新地址：`http://localhost:1420`（无 Tauri 窗口时可单独运行 `npm run dev`）

## 常用命令

```bash
# 仅构建前端（类型检查 + Vite 构建）
npm run build

# 仅编译 Rust（比完整构建快）
cargo build --manifest-path src-tauri/Cargo.toml

# 打包桌面应用
npm run tauri build

# 直接测试 Python 处理器（无需启动 Tauri）
cd python && source venv/bin/activate
python3 pdf_handler.py info '{"input_file": "/path/to/file.pdf"}'
python3 ocr_handler.py local '{"image_path": "/path/to/img.png", "lang": "chi_sim+eng"}'
python3 convert_handler.py pdf_to_markdown '{"input_file": "in.pdf", "output_file": "out.md"}'
python3 audio_handler.py convert_audio '{"input_file": "in.mp4", "target_format": "mp3"}'
python3 audio_handler.py convert_audio_batch '{"input_files": ["a.wav", "b.flac"], "target_format": "m4a"}'
```

## 项目结构

```
DocHub/
├── src/                    # React 前端
│   ├── components/         # 功能页面（PDF、Convert、OCR、Settings）
│   ├── hooks/useInvoke.ts  # Tauri 命令调用封装
│   ├── locales/            # i18n 语言包（zh.json / en.json）
│   └── i18n.ts             # i18next 初始化
├── src-tauri/src/lib.rs    # Tauri 命令层（Rust）
├── python/                 # Python 处理器
│   ├── pdf_handler.py
│   ├── convert_handler.py
│   └── ocr_handler.py
├── setup.sh                # 一键环境配置脚本
└── run.sh                  # 快捷启动脚本
```

## 设置

在应用内 **设置** 页面可配置：
- 界面语言（中文 / English）
- 主题（亮色 / 暗色）
- GLM API Key（保存在本地 `localStorage`，不上传）

## 推荐开发环境

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
