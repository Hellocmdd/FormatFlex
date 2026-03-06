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

# ─── 检测包管理器 ───────────────────────────────────────────────────────────
detect_pm() {
  if   command -v apt-get &>/dev/null; then PM="apt"; INSTALL="sudo apt-get install -y"
  elif command -v dnf     &>/dev/null; then PM="dnf"; INSTALL="sudo dnf install -y"
  elif command -v pacman  &>/dev/null; then PM="pacman"; INSTALL="sudo pacman -S --noconfirm"
  else error "未检测到支持的包管理器（apt / dnf / pacman）"; fi
  info "检测到包管理器: $PM"
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
      # Node.js 通过 nvm 安装，不走 apt（版本太旧）
      $INSTALL $PKGS
      ;;
    dnf)
      sudo dnf groupinstall -y "Development Tools"
      PKGS="curl wget file git openssl-devel gtk3-devel"
      PKGS="$PKGS webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf"
      PKGS="$PKGS python3 python3-pip python3-devel"
      PKGS="$PKGS tesseract tesseract-langpack-chi_sim tesseract-langpack-chi_tra"
      $INSTALL $PKGS
      ;;
    pacman)
      PKGS="base-devel curl wget git openssl gtk3"
      PKGS="$PKGS webkit2gtk-4.1 libappindicator-gtk3 librsvg patchelf"
      PKGS="$PKGS python python-pip"
      PKGS="$PKGS tesseract tesseract-data-chi_sim tesseract-data-chi_tra"
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
  
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm use --lts
    nvm alias default node
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
    rustup update stable --quiet
    return
  fi
  info "安装 Rust (via rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  source "$HOME/.cargo/env"
  success "Rust $(rustc --version) 安装完成"
}

# ─── 配置 Python 虚拟环境 ────────────────────────────────────────────────────
setup_python() {
  VENV_DIR="$(cd "$(dirname "$0")" && pwd)/python/venv"
  info "配置 Python 虚拟环境: $VENV_DIR"
  if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
  else
    warn "虚拟环境已存在，跳过创建"
  fi
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip --quiet
  pip install -r "$(dirname "$0")/python/requirements.txt" --quiet
  deactivate
  success "Python 虚拟环境配置完成"
}

# ─── 安装 npm 依赖 ───────────────────────────────────────────────────────────
install_npm_deps() {
  PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
  info "安装 npm 依赖..."
  # 确保 nvm node 可用
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  
  if ! command -v npm &>/dev/null; then
    warn "npm 未找到，跳过依赖安装"
    return
  fi

  cd "$PROJ_DIR"
  npm install --silent || warn "npm install 失败，请检查网络或权限"
  success "npm 依赖安装完成"
}

# ─── 验证环境 ────────────────────────────────────────────────────────────────
verify_env() {
  info "验证环境..."
  source "$HOME/.cargo/env" 2>/dev/null || true
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

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
