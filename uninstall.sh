#!/usr/bin/env bash
set -euo pipefail

# 卸载项目依赖的辅助脚本（Linux）
# 功能：可选择删除 Python 虚拟环境、node_modules、构建产物、可选移除系统包与 Rust toolchain
# 使用：sudo ./uninstall.sh      # 当需要移除系统包时
# 参数：
#   --remove-system   : 移除常见系统依赖（apt/dnf/pacman 支持）
#   --remove-rust     : 运行 `rustup self uninstall`（会移除全局 Rust 工具链）
#   -y                : 自动确认

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTO_YES=0
REMOVE_SYSTEM=0
REMOVE_RUST=0

usage(){
  cat <<EOF
Usage: $0 [--remove-system] [--remove-rust] [-y]
  --remove-system   Remove system packages: tesseract-ocr, pandoc, wkhtmltopdf, texlive-xetex (supports apt/dnf/pacman)
  --remove-rust     Run 'rustup self uninstall' to remove Rust toolchain
  -y                Assume yes for all confirmations
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remove-system) REMOVE_SYSTEM=1; shift;;
    --remove-rust) REMOVE_RUST=1; shift;;
    -y) AUTO_YES=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

confirm(){
  if [[ $AUTO_YES -eq 1 ]]; then
    return 0
  fi
  read -r -p "$1 [y/N]: " ans
  case "$ans" in
    [Yy]|[Yy][Ee][Ss]) return 0;;
    *) return 1;;
  esac
}

echo "项目根目录: $ROOT_DIR"

# 1) 删除 Python 虚拟环境
remove_venvs(){
  local venvs=("$ROOT_DIR/python/venv" "$ROOT_DIR/dep/python/venv")
  for v in "${venvs[@]}"; do
    if [[ -d "$v" ]]; then
      if confirm "Remove virtualenv $v?"; then
        rm -rf "$v"
        echo "Removed $v"
      else
        echo "Skipped $v"
      fi
    fi
  done
}

# 2) 删除 node_modules
remove_node_modules(){
  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    if confirm "Remove node_modules in project root?"; then
      rm -rf "$ROOT_DIR/node_modules"
      echo "Removed node_modules"
    else
      echo "Skipped node_modules"
    fi
  fi
}

# 3) 清理构建产物（Rust/tauri targets）
remove_build_artifacts(){
  local dirs=("$ROOT_DIR/target" "$ROOT_DIR/src-tauri/target" "$ROOT_DIR/build" )
  for d in "${dirs[@]}"; do
    if [[ -d "$d" ]]; then
      if confirm "Remove build directory $d?"; then
        rm -rf "$d"
        echo "Removed $d"
      else
        echo "Skipped $d"
      fi
    fi
  done
}

# 4) 可选：移除系统包（支持 apt, dnf, pacman）
remove_system_packages(){
  if [[ $REMOVE_SYSTEM -ne 1 ]]; then
    return
  fi
  PKGS=(tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng pandoc wkhtmltopdf texlive-xetex)
  echo "准备移除系统包: ${PKGS[*]}"
  if ! confirm "Proceed to remove system packages (requires sudo)?"; then
    echo "Skipped system package removal"
    return
  fi

  if command -v apt >/dev/null; then
    sudo apt remove -y "${PKGS[@]}" || true
    sudo apt autoremove -y || true
  elif command -v dnf >/dev/null; then
    sudo dnf remove -y "${PKGS[@]}" || true
  elif command -v pacman >/dev/null; then
    sudo pacman -Rns --noconfirm "${PKGS[@]}" || true
  else
    echo "未检测到受支持的包管理器 (apt/dnf/pacman)。请手动移除以下包: ${PKGS[*]}"
  fi
}

# 5) 可选：移除 Rust toolchain
remove_rust(){
  if [[ $REMOVE_RUST -ne 1 ]]; then
    return
  fi
  if ! command -v rustup >/dev/null; then
    echo "rustup 未安装，跳过"
    return
  fi
  if confirm "Run 'rustup self uninstall' and remove Rust toolchain (this affects whole system)?"; then
    rustup self uninstall
  else
    echo "Skipped rustup uninstall"
  fi
}

main(){
  remove_venvs
  remove_node_modules
  remove_build_artifacts
  remove_system_packages
  remove_rust
  echo "卸载脚本完成。请手动检查是否有遗留文件。"
}

main
