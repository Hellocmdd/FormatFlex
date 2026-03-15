#!/usr/bin/env bash
# 快速激活本项目 Python 虚拟环境
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/venv/bin/activate"
echo "Python venv activated: $VIRTUAL_ENV"
