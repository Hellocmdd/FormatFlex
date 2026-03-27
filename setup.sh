#!/usr/bin/env bash
# DocHub 一键环境配置脚本（Linux）
# 用法: bash setup.sh

set -euo pipefail

# ─── 颜色输出 ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

source_nvm_safely() {
  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # nvm.sh 在 set -u 下会访问未定义变量，这里临时关闭 nounset。
    set +u
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    set -u
    return 0
  fi
  return 1
}

# ─── 检测包管理器 ───────────────────────────────────────────────────────────
detect_pm() {
  if   command -v apt-get &>/dev/null; then PM="apt"; INSTALL="sudo apt-get install -y"
  elif command -v dnf     &>/dev/null; then PM="dnf"; INSTALL="sudo dnf install -y"
  elif command -v pacman  &>/dev/null; then PM="pacman"; INSTALL="sudo pacman -S --noconfirm"
  else error "未检测到支持的包管理器（apt / dnf / pacman）"; fi
  info "检测到包管理器: $PM"
}

# ─── apt 安全安装：遇到冲突时尝试修复或逐个回退 ─────────────────────────────────
safe_install_apt() {
  # 用法: safe_install_apt pkg1 pkg2 ...
  if [ $# -eq 0 ]; then return 0; fi
  sudo apt-get update -qq || true

  # 先尝试一次性安装（不带推荐包，减少冲突机会）
  set +e
  sudo apt-get install -y --no-install-recommends "$@"
  rc=$?
  set -e

  if [ "$rc" -eq 0 ]; then
    return 0
  fi

  warn "apt 安装遇到冲突或错误（退出码 $rc），尝试自动修复依赖并重试..."
  sudo apt-get -f install -y || true

  set +e
  sudo apt-get install -y --no-install-recommends "$@"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    return 0
  fi

  # 尝试使用 aptitude 自动给出替代方案
  if ! command -v aptitude &>/dev/null; then
    warn "系统未安装 aptitude，尝试安装 aptitude 以便自动解析依赖冲突..."
    set +e
    sudo apt-get install -y aptitude || true
    set -e
  fi

  if command -v aptitude &>/dev/null; then
    warn "使用 aptitude 尝试自动解决依赖冲突（可能会交互或移除某些包）..."
    set +e
    sudo aptitude -y install "$@" || true
    rc=$?
    set -e
    if [ "$rc" -eq 0 ]; then
      return 0
    fi
  fi

  # 最后手动逐个安装，跳过失败的包并报告
  warn "自动方式均失败，逐个尝试安装并跳过失败的软件包。" 
  local skipped=""
  for p in "$@"; do
    set +e
    sudo apt-get install -y --no-install-recommends "$p"
    rc=$?
    set -e
    if [ "$rc" -ne 0 ]; then
      warn "跳过无法安装的软件包： $p"
      skipped="$skipped $p"
    fi
  done

  if [ -n "$skipped" ]; then
    warn "以下软件包被跳过:$skipped 。请手动检查这些包的依赖或在兼容的发行版/容器中安装。"
    return 0
  fi
}

# ─── 预先提示并获取 sudo 凭证 ───────────────────────────────────────────────
prepare_sudo_credentials() {
  if [ "$(id -u)" -eq 0 ]; then
    info "当前为 root 用户，跳过 sudo 密码验证"
    return
  fi

  if ! command -v sudo &>/dev/null; then
    error "未找到 sudo，请安装 sudo 或使用 root 用户运行脚本"
  fi

  echo ""
  warn "下一步将安装系统依赖（编译工具链 / Tesseract / LibreOffice 等），需要管理员权限。"
  info "马上可能会出现 sudo 密码提示，这是正常现象。"
  sudo -v || error "sudo 身份验证失败，请确认密码后重试"
}

# ─── 安装系统依赖 ───────────────────────────────────────────────────────────
install_system_deps() {
  info "安装系统依赖..."
  case "$PM" in
    apt)
      sudo apt-get update -qq
      # Tauri 2 构建依赖
      PKGS="build-essential curl wget file git libssl-dev libgtk-3-dev"
      PKGS="$PKGS libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf"
      # Python 依赖
      PKGS="$PKGS python3 python3-pip python3-venv python3-dev"
      # Tesseract OCR + 中文语言包
      PKGS="$PKGS tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-chi-tra tesseract-ocr-eng"
      # PDF OCR 依赖（pdf2image 需要 pdftoppm）+ Pandoc PDF 转换依赖
      PKGS="$PKGS poppler-utils pandoc wkhtmltopdf texlive-xetex fonts-noto-cjk"
      # Office 文档转换依赖
      PKGS="$PKGS libreoffice"
      # 图片重格式依赖（RAW/HEIF/SVG/EXR）
      PKGS="$PKGS libraw-dev libheif-dev libopenexr-dev librsvg2-bin imagemagick"
      # CairoSVG / cffi 相关系统库
      PKGS="$PKGS libcairo2-dev libffi-dev libxml2-dev libxslt1-dev libjpeg-dev zlib1g-dev libde265-dev"
      # 音频/媒体转换依赖
      PKGS="$PKGS ffmpeg"
      # Node.js 通过 nvm 安装，不走 apt（版本太旧）
      safe_install_apt $PKGS
      ;;
    dnf)
      sudo dnf groupinstall -y "Development Tools"
      PKGS="curl wget file git openssl-devel gtk3-devel"
      PKGS="$PKGS webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf"
      PKGS="$PKGS python3 python3-pip python3-devel"
      PKGS="$PKGS tesseract tesseract-langpack-chi_sim tesseract-langpack-chi_tra"
      PKGS="$PKGS poppler-utils pandoc wkhtmltopdf texlive-xetex google-noto-cjk-fonts"
      PKGS="$PKGS libreoffice"
      PKGS="$PKGS libraw-devel libheif-devel openexr-devel librsvg2-tools ImageMagick"
      PKGS="$PKGS cairo-devel libffi-devel libxml2-devel libxslt-devel libjpeg-turbo-devel zlib-devel libde265-devel"
      PKGS="$PKGS ffmpeg"
      $INSTALL $PKGS
      ;;
    pacman)
      PKGS="base-devel curl wget git openssl gtk3"
      PKGS="$PKGS webkit2gtk-4.1 libappindicator-gtk3 librsvg patchelf"
      PKGS="$PKGS python python-pip"
      PKGS="$PKGS tesseract tesseract-data-chi_sim tesseract-data-chi_tra"
      PKGS="$PKGS poppler pandoc wkhtmltopdf texlive-xetex noto-fonts-cjk"
      PKGS="$PKGS libreoffice-fresh"
      PKGS="$PKGS libraw libheif openexr librsvg imagemagick"
      PKGS="$PKGS cairo libffi libxml2 libxslt libjpeg-turbo zlib libde265"
      PKGS="$PKGS ffmpeg"
      $INSTALL $PKGS
      ;;
  esac
  success "系统依赖安装完成"
}

# ─── 安装 Node.js (via nvm) ─────────────────────────────────────────────────
install_node() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    info "Node.js 已存在: $NODE_VER，跳过安装"
    return
  fi
  info "安装 Node.js (via nvm)..."
  export NVM_DIR="$HOME/.nvm"
  if [ ! -d "$NVM_DIR" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash || true
  fi

  if source_nvm_safely; then
    set +u
    nvm install --lts
    nvm use --lts
    nvm alias default node
    set -u
    success "Node.js $(node --version) 安装完成"
  else
    warn "NVM 安装似乎失败，尝试直接安装 npm..."
    # Fallback if nvm fails (e.g. connectivity issues)
  fi
}

# ─── 安装 Rust (via rustup) ─────────────────────────────────────────────────
install_rust() {
  if command -v rustc &>/dev/null || [ -f "$HOME/.cargo/bin/rustc" ]; then
    # 确保 cargo 在 PATH
    source "$HOME/.cargo/env" 2>/dev/null || true
    info "Rust 已存在: $(rustc --version)，检查更新..."
    rustup update stable
    return
  fi
  info "安装 Rust (via rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  source "$HOME/.cargo/env"
  success "Rust $(rustc --version) 安装完成"
}

# ─── 配置 Python 虚拟环境 ────────────────────────────────────────────────────
setup_python() {
  PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
  PY_DIR="$PROJ_DIR/python"
  DEP_DIR="$PROJ_DIR/dep"
  VENV_DIR="$DEP_DIR/python/venv"
  REQ_FILE="$PY_DIR/requirements.txt"
  ACTIVATE_HELPER="$DEP_DIR/activate.sh"

  info "配置 Python 虚拟环境: $VENV_DIR"

  if ! command -v python3 &>/dev/null; then
    error "未找到 python3，请先安装 Python 3"
  fi

  # venv 目录存在但不完整时，删除后重建，避免后续激活失败。
  if [ -d "$VENV_DIR" ] && [ ! -f "$VENV_DIR/bin/activate" ]; then
    warn "检测到损坏的虚拟环境，正在重建"
    rm -rf "$VENV_DIR"
  fi

  if [ ! -d "$VENV_DIR" ]; then
    mkdir -p "$DEP_DIR/python"
    python3 -m venv "$VENV_DIR"
  else
    warn "虚拟环境已存在，复用现有环境"
  fi

  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  python -m pip install --upgrade pip --quiet

  if [ -f "$REQ_FILE" ]; then
    python -m pip install -r "$REQ_FILE" --quiet
  else
    warn "未找到 $REQ_FILE，跳过 Python 依赖安装"
  fi

  cat > "$ACTIVATE_HELPER" <<'EOF'
#!/usr/bin/env bash
# 快速激活本项目 Python 虚拟环境
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/venv/bin/activate"
echo "Python venv activated: $VIRTUAL_ENV"
EOF
  chmod +x "$ACTIVATE_HELPER"

  deactivate || true
  success "Python 虚拟环境配置完成（激活脚本: dep/activate.sh）"
}

# ─── 安装 npm 依赖 ───────────────────────────────────────────────────────────
install_npm_deps() {
  PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
  info "安装 npm 依赖..."
  # 确保 nvm node 可用
  if source_nvm_safely; then
    set +u
    nvm use --silent default >/dev/null 2>&1 || nvm use --silent --lts >/dev/null 2>&1 || true
    set -u
  fi
  
  if ! command -v npm &>/dev/null; then
    warn "npm 未找到，跳过依赖安装"
    return
  fi

  cd "$PROJ_DIR"
  npm install --silent || warn "npm install 失败，请检查网络或权限"
  success "npm 依赖安装完成，请重启终端再次运行该脚本以确保环境变量生效"
}

# ─── 验证环境 ────────────────────────────────────────────────────────────────
verify_env() {
  info "验证环境..."
  source "$HOME/.cargo/env" 2>/dev/null || true
  source_nvm_safely || true
  if command -v nvm &>/dev/null; then
    set +u
    nvm use --silent default >/dev/null 2>&1 || nvm use --silent --lts >/dev/null 2>&1 || true
    set -u
  fi

  local ok=true
  check() {
    if command -v "$1" &>/dev/null; then
      success "$1: $($1 --version 2>&1 | head -1)"
    else
      warn "$1: 未找到"
      ok=false
    fi
  }
  check node
  check npm
  check rustc
  check cargo
  check python3
  check tesseract
  check libreoffice
  check soffice
  check ffmpeg
  check pandoc
  check pdftoppm
  check wkhtmltopdf
  check xelatex

  if [ "$ok" = true ]; then
    success "所有依赖验证通过 ✓"
  else
    warn "部分依赖未就绪，请检查上方警告"
  fi
}

# ─── 主流程 ──────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║     DocHub 环境配置脚本              ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
  echo ""

  detect_pm
  prepare_sudo_credentials
  install_system_deps
  install_node
  install_rust
  setup_python
  install_npm_deps
  verify_env

  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  环境配置完成！使用以下命令启动开发服务：           ║${NC}"
  echo -e "${GREEN}║                                                      ║${NC}"
  echo -e "${GREEN}║    source ~/.cargo/env                               ║${NC}"
  echo -e "${GREEN}║    npm run tauri dev                                 ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

main "$@"
