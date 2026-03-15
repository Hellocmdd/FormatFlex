#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY_VENV_DIR="$PROJECT_DIR/python/venv"

# Prefer project Python venv so Tauri->Python handlers resolve consistent dependencies.
if [ -x "$PY_VENV_DIR/bin/python3" ]; then
    export PATH="$PY_VENV_DIR/bin:$PATH"
    echo "Using project Python venv: $PY_VENV_DIR"
else
    echo "Warning: python venv not found at $PY_VENV_DIR"
    echo "Run: bash setup.sh"
fi

# Source cargo environment variables to ensure Rust/Cargo are on PATH
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# WSLg often logs libEGL/MESA warnings when hardware acceleration is unavailable.
# Force software rendering in WSL to reduce noisy warnings and improve startup stability.
if grep -qi microsoft /proc/version 2>/dev/null; then
    export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
    export GALLIUM_DRIVER="${GALLIUM_DRIVER:-llvmpipe}"
    export MESA_LOADER_DRIVER_OVERRIDE="${MESA_LOADER_DRIVER_OVERRIDE:-llvmpipe}"
    echo "WSL detected: using Mesa software rendering (llvmpipe)."
fi

echo "Starting DocHub in development mode..."
npm run tauri dev
