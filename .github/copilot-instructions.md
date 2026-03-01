# DocHub Copilot Instructions

## Commands

```bash
# Development (starts Vite dev server + Tauri window)
source ~/.cargo/env   # required – Rust not on PATH by default
npm run tauri dev

# Frontend only (no Tauri window, hot-reload at http://localhost:1420)
npm run dev

# Type-check + production frontend build
npm run build

# Rust-only build (faster than full tauri build)
cargo build --manifest-path src-tauri/Cargo.toml

# Full desktop bundle
npm run tauri build

# Test a Python handler directly (no Tauri needed)
cd python && source venv/bin/activate
python3 pdf_handler.py info '{"input_file": "/path/to/file.pdf"}'
python3 ocr_handler.py local '{"image_path": "/path/to/img.png", "lang": "chi_sim+eng"}'
python3 convert_handler.py pdf_to_markdown '{"input_file": "in.pdf", "output_file": "out.md"}'
```

## Architecture

The app has three independent layers that communicate in a strict chain:

```
React UI  →  invokeCmd()  →  Tauri (Rust)  →  Python subprocess  →  Python handler
```

**Python subprocess bridge** (`src-tauri/src/lib.rs → run_python_handler`):  
Every Tauri command is a thin wrapper that calls `run_python_handler(script, operation, json_params)`. The function walks up the directory tree (up to 5 levels) to find `python/venv/bin/python3`, falling back to system `python3`. All parameters travel as a single JSON string; all responses are JSON printed to stdout.

**Python handlers** (`python/`):  
Each script (`pdf_handler.py`, `convert_handler.py`, `ocr_handler.py`) exposes an `OPERATIONS` dict mapping operation names to functions. Called as: `python3 <script>.py <operation> '<json_params>'`. Every function returns `{"success": bool, ...}`. Imports are lazy (inside each function) so the script starts fast even without all libraries installed.

**Frontend → Tauri bridge** (`src/hooks/useInvoke.ts`):  
All frontend→backend calls go through `invokeCmd<T>(cmd, params)`. It wraps `invoke()` by serializing params as a JSON string (matching the Rust `params: String` signature) and parsing the JSON string response back into `T`.

**i18n** (`src/i18n.ts`, `src/locales/`):  
Language is persisted in `localStorage`. The Ant Design `locale` prop in `App.tsx` is synchronized with `i18n.language`. Both `zh.json` and `en.json` must be kept in sync — same key structure.

**Dark mode**: `darkMode` state lives in `App.tsx` and flows down to `AppLayout` (for Ant Design `algorithm`) and `SettingsPage` (for the toggle). Ant Design theme switching is done via `theme.darkAlgorithm` / `theme.defaultAlgorithm` on `<ConfigProvider>`.

**Baidu OCR credentials** are read from `localStorage` keys `baidu_app_id`, `baidu_api_key`, `baidu_secret_key` — set in `SettingsPage`, read in `OCRPage`.

## Key Conventions

### Adding a new Tauri command

1. Add a Python function in the relevant `python/*_handler.py` and register it in the `OPERATIONS` dict.
2. Add a Rust function in `src-tauri/src/lib.rs` — always **without** `pub`, annotated with `#[tauri::command]`, taking `params: String`:
   ```rust
   #[tauri::command]
   fn my_new_cmd(params: String) -> Result<String, String> {
       run_python_handler("pdf_handler.py", "my_operation", &params)
   }
   ```
   > ⚠️ Do **not** use `pub fn` for command functions — Tauri 2 macro expansion causes `E0255` duplicate-macro errors when combined with `pub`.
3. Register the function in `tauri::generate_handler![...]` inside `run()`.
4. Call it from the frontend via `invokeCmd<PyResult>('my_new_cmd', { key: value })`.

### Python handler return shape
```python
# success
{"success": True, "output": "/path/to/result.pdf", ...}
# failure  
{"success": False, "error": "description"}
```
The `PyResult` TypeScript interface in `useInvoke.ts` covers the common fields. Extend it locally in a component for operation-specific extra fields (e.g., `ratio`, `pages`, `words_count`).

### Frontend component pattern
Each feature page (`PDFPage`, `ConvertPage`, `OCRPage`) is a single file using **function components defined inline** as `const FooTab = () => { ... }` inside the parent, then composed into an Ant Design `<Tabs items={...} />`. This keeps all state local to each tab and avoids prop drilling.

### i18n keys
All user-visible strings use `t('section.subsection.key')` — never hardcoded Chinese or English. When adding new UI text, add the key to **both** `src/locales/zh.json` and `src/locales/en.json`.

### File path handling
`Upload` components use `(file as any).path` to get the native file system path from Tauri's file picker — this is the Tauri-specific field, not the web `File` API `name`.

## Python Environment

```bash
# Setup from scratch
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# System dependencies also required
sudo apt install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng
sudo apt install libreoffice   # for Word/Excel/PPT → PDF conversion
```

The venv must live at `python/venv/` — this path is hardcoded in `run_python_handler`.
