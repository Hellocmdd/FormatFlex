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
| 图片（JPG/PNG 等） | PDF |
| HTML | PDF |

> Word / Excel / PPT 转换需要安装 LibreOffice。

### 图片文字识别（OCR）
- **本地 Tesseract**：离线识别，支持中英文
- **百度云 OCR**：高精度云端识别（需配置 API Key）

## 环境要求

- Node.js ≥ 18
- Rust（通过 rustup 安装）
- Python 3.10+
- Tesseract OCR（本地 OCR 功能）
- LibreOffice（Office 文档转换功能）

## 快速开始

### 一键安装（Linux）

```bash
bash setup.sh
```

脚本会自动安装 Node.js（via nvm）、Rust（via rustup）、系统依赖（Tesseract 等）并配置 Python 虚拟环境。

### 手动安装

```bash
# 1. 安装系统依赖
sudo apt install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng
sudo apt install libreoffice   # 可选，Office 转换需要

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
- 百度云 OCR API Key（保存在本地 `localStorage`，不上传）

## 推荐开发环境

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
