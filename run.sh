#!/bin/bash

# Source cargo environment variables to ensure Rust/Cargo are on PATH
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

echo "Starting DocHub in development mode..."
npm run tauri dev
