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

### Linux

#### 安装依赖

一键安装：

```bash
bash setup.sh
```

手动安装：

```bash
# 1. 安装系统依赖
sudo apt install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng
sudo apt install libreoffice   # Office 转换需要
sudo apt install ffmpeg        # 音频转换需要
sudo apt install pandoc wkhtmltopdf texlive-xetex poppler-utils

# 2. 配置 Python 虚拟环境
mkdir -p dep/python
python3 -m venv dep/python/venv
source dep/python/venv/bin/activate
pip install -r requirements.txt

# 3. 安装 npm 依赖
npm install
```

#### 启动

```bash
source ~/.cargo/env   # Rust 不在默认 PATH，每次新 shell 需要执行
npm run tauri dev
# 或使用快捷脚本
bash run.sh
```

注意（关于 `source ~/.cargo/env` 与持久化）

- 如果你希望把安装脚本的环境（例如 `cargo`）立即加载到当前终端，会话中可以运行：

```bash
source setup.sh
```

- 但是通过 `source` 加载只影响当前 shell 会话：关闭终端或新开一个终端后，环境变量不会自动保留。要在新 shell 中仍然可用，有两种方式：
	- 让脚本将 `source ~/.cargo/env` 追加到你的 shell 启动文件（`~/.profile`, `~/.bashrc`, `~/.zshrc` 等）。`setup.sh` 在完整安装（`bash setup.sh`）时会尝试执行此操作；
	- 或者手动在你的 shell 配置文件中添加：

```bash
if [ -f "$HOME/.cargo/env" ]; then
	source "$HOME/.cargo/env"
fi
```

- 总结：
	- 若只是临时使用：`source ~/.cargo/env`即可；
	- 若希望每次新终端都可用：运行 `bash setup.sh` 执行完整安装（脚本会试图将 `source` 写入常见的 rc 文件），或手动把 `source ~/.cargo/env` 加入你的 shell 启动脚本。

### Windows

#### 安装依赖

一键安装（PowerShell）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
```

一键安装（双击）：

```text
setup.bat
```

Windows 脚本会优先通过 winget 安装 Python、Rustup、Node.js、Tesseract、LibreOffice、MiKTeX（可选依赖失败不会阻塞主流程）。
FFmpeg/Pandoc/Poppler/wkhtmltopdf 默认下载到 `dep/tools/*`；本地下载失败时默认自动回退到 winget 全局安装。

可选参数：

```powershell
# 禁用本地工具失败后的全局回退
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -NoGlobalToolFallback

# 优先将 Tesseract / LibreOffice 落地到 dep/tools（必要时回退全局安装）
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -PreferLocalOfficeOcr

# 严格本地模式（禁用全局回退）
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -PreferLocalOfficeOcr -NoGlobalToolFallback
```

#### 启动

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
# 或双击
run.bat
```

#### 卸载

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
# 或双击
uninstall.bat
```

卸载脚本会先要求输入 `YES`，然后清理项目本地依赖目录：`dep`、`node_modules`、`src-tauri\target`、`dist`。

通过 `uninstall.bat` 启动时，默认会列出当前已安装的全局依赖（Python、Rustup、Node.js、Tesseract、LibreOffice、MiKTeX）供你选择删除。
若需要管理员权限删除全局依赖，脚本会在本地清理完成后启动一个“仅全局卸载”的提权窗口，不会重复执行本地清理流程。

```powershell
# 仅本地清理（跳过全局依赖选择）
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1

# 一次性删除所有受管全局依赖
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1 -RemoveGlobalDeps
```

### dep 本地依赖目录

项目现在会优先使用仓库内的 `dep/` 目录来放置和解析本地依赖，当前默认布局如下：

```text
dep/
	activate.ps1
	activate.sh
	python/venv/
	cargo/bin/
	bin/
	tools/
		ffmpeg/
		pandoc/
		poppler/
		tesseract/
		libreoffice/
		wkhtmltopdf/
		miktex/
```

当前已完成：
- Python 包环境默认安装到 `dep/python/venv`
- Node.js 默认通过 winget 全局安装
- FFmpeg / Pandoc / Poppler / wkhtmltopdf 默认安装到 `dep/tools`
- 运行时优先从 `dep/bin`、`dep/cargo/bin`、`dep/tools/*` 与系统 PATH 解析可执行文件
- Python 处理器优先从 `dep/tools` 查找 ffmpeg / ffprobe / pandoc / tesseract / libreoffice / wkhtmltopdf / pdftoppm / xelatex

仍需注意：
- Rust 工具链 / LibreOffice / Tesseract 等当前安装脚本仍以系统安装为主，只是运行时已支持本地优先
- Windows 下 Tauri 运行通常仍依赖系统级 WebView2，Rust 也通常仍依赖系统级编译工具链
- wkhtmltopdf 的 Windows 可下载资产在上游 release 中不稳定；严格本地模式下若安装失败，会提示手动安装或启用全局回退

前端热更新地址：`http://localhost:1420`（无 Tauri 窗口时可单独运行 `npm run dev`）

## 常用命令

### Linux / macOS

```bash
# 仅构建前端（类型检查 + Vite 构建）
npm run build

# 仅编译 Rust（比完整构建快）
cargo build --manifest-path src-tauri/Cargo.toml

# 打包桌面应用
npm run tauri build

# 直接测试 Python 处理器（无需启动 Tauri）
source dep/python/venv/bin/activate
cd python
python3 pdf_handler.py info '{"input_file": "/path/to/file.pdf"}'
python3 ocr_handler.py local '{"image_path": "/path/to/img.png", "lang": "chi_sim+eng"}'
python3 convert_handler.py pdf_to_markdown '{"input_file": "in.pdf", "output_file": "out.md"}'
python3 audio_handler.py convert_audio '{"input_file": "in.mp4", "target_format": "mp3"}'
python3 audio_handler.py convert_audio_batch '{"input_files": ["a.wav", "b.flac"], "target_format": "m4a"}'
```

### Windows（PowerShell）

```powershell
# 仅构建前端（类型检查 + Vite 构建）
npm run build

# 仅编译 Rust（比完整构建快）
cargo build --manifest-path src-tauri/Cargo.toml

# 打包桌面应用
npm run tauri build

# 直接测试 Python 处理器（无需启动 Tauri）
.\dep\activate.ps1
Set-Location .\python
python .\pdf_handler.py info '{"input_file":"C:/path/to/file.pdf"}'
python .\ocr_handler.py local '{"image_path":"C:/path/to/img.png","lang":"chi_sim+eng"}'
python .\convert_handler.py pdf_to_markdown '{"input_file":"in.pdf","output_file":"out.md"}'
python .\audio_handler.py convert_audio '{"input_file":"in.mp4","target_format":"mp3"}'
python .\audio_handler.py convert_audio_batch '{"input_files":["a.wav","b.flac"],"target_format":"m4a"}'
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
