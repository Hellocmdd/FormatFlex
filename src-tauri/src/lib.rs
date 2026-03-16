// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

fn default_python_command() -> String {
    #[cfg(target_os = "windows")]
    {
        if Command::new("python")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
        {
            return "python".to_string();
        }
        return "py".to_string();
    }

    #[cfg(not(target_os = "windows"))]
    {
        if Command::new("python3")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
        {
            return "python3".to_string();
        }
        return "python".to_string();
    }
}

// ── Global bruteforce process handle (for cancellation) ───────────────────────

static BRUTEFORCE_CHILD: std::sync::LazyLock<Arc<Mutex<Option<std::process::Child>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

static AUDIO_CONVERT_CHILD: std::sync::LazyLock<Arc<Mutex<Option<std::process::Child>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

static AUDIO_NCM_CONVERT_CHILD: std::sync::LazyLock<Arc<Mutex<Option<std::process::Child>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

static AUDIO_KGM_CONVERT_CHILD: std::sync::LazyLock<Arc<Mutex<Option<std::process::Child>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

static AUDIO_UNLOCK_CHILD: std::sync::LazyLock<Arc<Mutex<Option<std::process::Child>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

static VIDEO_CONVERT_CHILD: std::sync::LazyLock<Arc<Mutex<Option<std::process::Child>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

/// Resolve python interpreter and script path by walking up from cwd.
fn resolve_python_and_script(script: &str) -> (String, String) {
    let python = std::env::current_dir()
        .ok()
        .and_then(|d| {
            let mut p = d.clone();
            for _ in 0..5 {
                // Prefer workspace-level .venv, then fallback to python/venv for backward compatibility.
                let candidates = [
                    p.join("dep/python/venv/Scripts/python.exe"),
                    p.join("dep/python/venv/bin/python"),
                    p.join("dep/python/venv/bin/python3"),
                    p.join(".venv/Scripts/python.exe"),
                    p.join(".venv/bin/python"),
                    p.join(".venv/bin/python3"),
                    p.join("python/venv/Scripts/python.exe"),
                    p.join("python/venv/bin/python"),
                    p.join("python/venv/bin/python3"),
                    p.join("venv/Scripts/python.exe"),
                    p.join("venv/bin/python"),
                    p.join("venv/bin/python3"),
                ];

                for venv in candidates {
                    if venv.exists() {
                        return Some(venv.to_string_lossy().to_string());
                    }
                }
                if !p.pop() { break; }
            }
            None
        })
        .unwrap_or_else(default_python_command);

    let script_path = std::env::current_dir()
        .map(|d| {
            let mut p = d.clone();
            for _ in 0..5 {
                let s = p.join(format!("python/{}", script));
                if s.exists() {
                    return s.to_string_lossy().to_string();
                }
                if !p.pop() { break; }
            }
            format!("python/{}", script)
        })
        .unwrap_or_else(|_| format!("python/{}", script));

    (python, script_path)
}

/// Run a Python handler script with the given operation and JSON params.
/// Returns the JSON output from the Python script.
fn run_python_handler(script: &str, operation: &str, params: &str) -> Result<String, String> {
    let (python, script_path) = resolve_python_and_script(script);

    let output = Command::new(&python)
        .arg(&script_path)
        .arg(operation)
        .arg(params)
        .output()
        .map_err(|e| format!("Failed to run python: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8 output: {}", e))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Python script error: {}", stderr))
    }
}

// ── PDF Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
fn pdf_merge(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "merge", &params)
}

#[tauri::command]
fn pdf_split(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "split", &params)
}

#[tauri::command]
fn pdf_encrypt(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "encrypt", &params)
}

#[tauri::command]
fn pdf_decrypt(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "decrypt", &params)
}

#[tauri::command]
fn pdf_compress(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "compress", &params)
}

#[tauri::command]
fn pdf_watermark(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "watermark", &params)
}

#[tauri::command]
fn pdf_page_numbers(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "page_numbers", &params)
}

#[tauri::command]
fn pdf_preview_page_numbers(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "preview_page_numbers", &params)
}

#[tauri::command]
fn pdf_preview_pages(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "preview_pages", &params)
}

#[tauri::command]
fn pdf_reorder_pages(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "reorder_pages", &params)
}

#[tauri::command]
fn pdf_to_docx(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "to_docx", &params)
}

#[tauri::command]
fn pdf_preview_watermark(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "preview_watermark", &params)
}

#[tauri::command]
fn pdf_info(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "info", &params)
}

// ── Conversion Commands ───────────────────────────────────────────────────────

#[tauri::command]
fn convert_word_to_pdf(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "word_to_pdf", &params)
}

#[tauri::command]
fn convert_excel_to_pdf(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "excel_to_pdf", &params)
}

#[tauri::command]
fn convert_pptx_to_pdf(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "pptx_to_pdf", &params)
}

#[tauri::command]
fn convert_word_to_markdown(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "word_to_markdown", &params)
}

#[tauri::command]
fn convert_excel_to_markdown(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "excel_to_markdown", &params)
}

#[tauri::command]
fn convert_pdf_to_markdown(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "pdf_to_markdown", &params)
}

#[tauri::command]
fn convert_images_to_pdf(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "images_to_pdf", &params)
}

#[tauri::command]
fn convert_html_to_pdf(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "html_to_pdf", &params)
}

#[tauri::command]
fn convert_markdown_to_pdf(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "markdown_to_pdf", &params)
}

#[tauri::command]
fn convert_markdown_to_excel(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "markdown_to_excel", &params)
}

#[tauri::command]
fn convert_pdf_to_excel(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "pdf_to_excel", &params)
}

#[tauri::command]
fn convert_excel_to_csv(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "excel_to_csv", &params)
}

#[tauri::command]
fn image_convert(params: String) -> Result<String, String> {
    run_python_handler("image_handler.py", "image_convert", &params)
}

#[tauri::command]
fn any_to_images(params: String) -> Result<String, String> {
    run_python_handler("image_handler.py", "any_to_images", &params)
}

#[tauri::command]
fn image_supported_formats(params: String) -> Result<String, String> {
    run_python_handler("image_handler.py", "supported_image_formats", &params)
}

// ── Audio Commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn convert_audio(params: String) -> Result<String, String> {
    run_python_handler("audio_handler.py", "convert_audio", &params)
}

#[tauri::command]
fn convert_audio_batch(params: String) -> Result<String, String> {
    run_python_handler("audio_handler.py", "convert_audio_batch", &params)
}

#[tauri::command]
fn audio_probe_media(params: String) -> Result<String, String> {
    run_python_handler("audio_handler.py", "probe_media", &params)
}

#[tauri::command]
fn audio_supported_formats(params: String) -> Result<String, String> {
    run_python_handler("audio_handler.py", "supported_audio_formats", &params)
}

#[tauri::command]
fn audio_convert_batch_stream(app: tauri::AppHandle, params: String) -> Result<String, String> {
    {
        let mut guard = AUDIO_CONVERT_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    let (python, script_path) = resolve_python_and_script("audio_handler.py");

    let mut child = Command::new(&python)
        .arg(&script_path)
        .arg("convert_audio_batch_stream")
        .arg(&params)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start audio batch convert: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let child_arc = AUDIO_CONVERT_CHILD.clone();
    *child_arc.lock().unwrap() = Some(child);

    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&l) {
                        let event_type = val.get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let _ = app.emit("audio_convert_progress", &val);
                        if matches!(event_type.as_str(), "done" | "error") {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }

        let mut guard = child_arc.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.wait();
        }
        *guard = None;
    });

    Ok(r#"{"success":true,"status":"started"}"#.to_string())
}

#[tauri::command]
fn audio_convert_batch_cancel() -> Result<String, String> {
    let mut guard = AUDIO_CONVERT_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        return Ok(r#"{"success":true,"cancelled":true}"#.to_string());
    }
    Ok(r#"{"success":true,"cancelled":false}"#.to_string())
}

#[tauri::command]
fn audio_ncm_convert(params: String) -> Result<String, String> {
    run_python_handler("audio_handler.py", "ncm_to_audio", &params)
}

#[tauri::command]
fn audio_ncm_convert_batch_stream(app: tauri::AppHandle, params: String) -> Result<String, String> {
    {
        let mut guard = AUDIO_NCM_CONVERT_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    let (python, script_path) = resolve_python_and_script("audio_handler.py");

    let mut child = Command::new(&python)
        .arg(&script_path)
        .arg("ncm_to_audio_batch_stream")
        .arg(&params)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ncm batch convert: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let child_arc = AUDIO_NCM_CONVERT_CHILD.clone();
    *child_arc.lock().unwrap() = Some(child);

    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&l) {
                        let event_type = val.get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let _ = app.emit("audio_ncm_convert_progress", &val);
                        if matches!(event_type.as_str(), "done" | "error") {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }

        let mut guard = child_arc.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.wait();
        }
        *guard = None;
    });

    Ok(r#"{"success":true,"status":"started"}"#.to_string())
}

#[tauri::command]
fn audio_ncm_convert_batch_cancel() -> Result<String, String> {
    let mut guard = AUDIO_NCM_CONVERT_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        return Ok(r#"{"success":true,"cancelled":true}"#.to_string());
    }
    Ok(r#"{"success":true,"cancelled":false}"#.to_string())
}

#[tauri::command]
fn audio_kgm_convert(params: String) -> Result<String, String> {
    run_python_handler("audio_handler.py", "kgm_to_audio", &params)
}

#[tauri::command]
fn audio_kgm_convert_batch_stream(app: tauri::AppHandle, params: String) -> Result<String, String> {
    {
        let mut guard = AUDIO_KGM_CONVERT_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    let (python, script_path) = resolve_python_and_script("audio_handler.py");

    let mut child = Command::new(&python)
        .arg(&script_path)
        .arg("kgm_to_audio_batch_stream")
        .arg(&params)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start kgm batch convert: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let child_arc = AUDIO_KGM_CONVERT_CHILD.clone();
    *child_arc.lock().unwrap() = Some(child);

    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&l) {
                        let event_type = val.get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let _ = app.emit("audio_kgm_convert_progress", &val);
                        if matches!(event_type.as_str(), "done" | "error") {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }

        let mut guard = child_arc.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.wait();
        }
        *guard = None;
    });

    Ok(r#"{"success":true,"status":"started"}"#.to_string())
}

#[tauri::command]
fn audio_kgm_convert_batch_cancel() -> Result<String, String> {
    let mut guard = AUDIO_KGM_CONVERT_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        return Ok(r#"{"success":true,"cancelled":true}"#.to_string());
    }
    Ok(r#"{"success":true,"cancelled":false}"#.to_string())
}

// ── Audio Unlock (unified: NCM / KGM / VPR / KGG / QMCv2) ───────────────────

#[tauri::command]
fn audio_unlock(params: String) -> Result<String, String> {
    run_python_handler("audio_handler.py", "unlock_audio", &params)
}

#[tauri::command]
fn audio_unlock_batch_stream(app: tauri::AppHandle, params: String) -> Result<String, String> {
    {
        let mut guard = AUDIO_UNLOCK_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    let (python, script_path) = resolve_python_and_script("audio_handler.py");

    let mut child = Command::new(&python)
        .arg(&script_path)
        .arg("unlock_audio_batch_stream")
        .arg(&params)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start unlock batch: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let child_arc = AUDIO_UNLOCK_CHILD.clone();
    *child_arc.lock().unwrap() = Some(child);

    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&l) {
                        let event_type = val.get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let _ = app.emit("audio_unlock_progress", &val);
                        if matches!(event_type.as_str(), "done" | "error") {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }

        let mut guard = child_arc.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.wait();
        }
        *guard = None;
    });

    Ok(r#"{"success":true,"status":"started"}"#.to_string())
}

#[tauri::command]
fn audio_unlock_batch_cancel() -> Result<String, String> {
    let mut guard = AUDIO_UNLOCK_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        return Ok(r#"{"success":true,"cancelled":true}"#.to_string());
    }
    Ok(r#"{"success":true,"cancelled":false}"#.to_string())
}

// ── Video Commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn video_convert(params: String) -> Result<String, String> {
    run_python_handler("video_handler.py", "convert_video", &params)
}

#[tauri::command]
fn video_probe_info(params: String) -> Result<String, String> {
    run_python_handler("video_handler.py", "probe_video_info", &params)
}

#[tauri::command]
fn video_supported_formats(params: String) -> Result<String, String> {
    run_python_handler("video_handler.py", "supported_video_formats", &params)
}

#[tauri::command]
fn video_convert_batch_stream(app: tauri::AppHandle, params: String) -> Result<String, String> {
    {
        let mut guard = VIDEO_CONVERT_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    let (python, script_path) = resolve_python_and_script("video_handler.py");

    let mut child = Command::new(&python)
        .arg(&script_path)
        .arg("convert_video_batch_stream")
        .arg(&params)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start video batch convert: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let child_arc = VIDEO_CONVERT_CHILD.clone();
    *child_arc.lock().unwrap() = Some(child);

    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&l) {
                        let event_type = val.get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let _ = app.emit("video_convert_progress", &val);
                        if matches!(event_type.as_str(), "done" | "error") {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }

        let mut guard = child_arc.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.wait();
        }
        *guard = None;
    });

    Ok(r#"{"success":true,"status":"started"}"#.to_string())
}

#[tauri::command]
fn video_convert_batch_cancel() -> Result<String, String> {
    let mut guard = VIDEO_CONVERT_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        return Ok(r#"{"success":true,"cancelled":true}"#.to_string());
    }
    Ok(r#"{"success":true,"cancelled":false}"#.to_string())
}

// ── OCR Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
fn ocr_local(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "local", &params)
}

#[tauri::command]
fn ocr_glm(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "glm", &params)
}

#[tauri::command]
fn ocr_pdf(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "pdf", &params)
}

#[tauri::command]
fn ocr_batch(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "batch", &params)
}

#[tauri::command]
fn ocr_auto(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "auto", &params)
}

// ── Bruteforce Commands ───────────────────────────────────────────────────────

/// Start a brute-force attack in a background OS thread.
/// Python streams JSON progress lines to stdout; we emit them as Tauri events.
/// Returns immediately with {"success":true,"status":"started"}.
#[tauri::command]
fn pdf_bruteforce(app: tauri::AppHandle, params: String) -> Result<String, String> {
    // Kill any running bruteforce first
    {
        let mut guard = BRUTEFORCE_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    let (python, script_path) = resolve_python_and_script("pdf_handler.py");

    let mut child = Command::new(&python)
        .arg(&script_path)
        .arg("bruteforce")
        .arg(&params)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start bruteforce: {}", e))?;

    // Take stdout before storing child
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let child_arc = BRUTEFORCE_CHILD.clone();
    *child_arc.lock().unwrap() = Some(child);

    // Spawn OS thread to read stdout line-by-line and emit Tauri events
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&l) {
                        let event_type = val.get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let _ = app.emit("bruteforce_progress", &val);
                        if matches!(event_type.as_str(), "found" | "done" | "error") {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }
        // Clean up child process
        let mut guard = child_arc.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.wait();
        }
        *guard = None;
    });

    Ok(r#"{"success":true,"status":"started"}"#.to_string())
}

/// Cancel a running brute-force attack.
#[tauri::command]
fn pdf_bruteforce_cancel() -> Result<String, String> {
    let mut guard = BRUTEFORCE_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        return Ok(r#"{"success":true,"cancelled":true}"#.to_string());
    }
    Ok(r#"{"success":true,"cancelled":false}"#.to_string())
}

// ── App Entry ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // PDF
            pdf_merge, pdf_split, pdf_encrypt, pdf_decrypt,
            pdf_compress, pdf_watermark, pdf_page_numbers,
            pdf_preview_watermark, pdf_preview_page_numbers,
            pdf_preview_pages, pdf_reorder_pages,
            pdf_to_docx, pdf_info,
            // Convert
               convert_word_to_pdf, convert_excel_to_pdf, convert_pptx_to_pdf,
               convert_word_to_markdown, convert_excel_to_markdown, convert_pdf_to_markdown,
               convert_images_to_pdf, convert_html_to_pdf, convert_markdown_to_pdf,
               convert_markdown_to_excel, convert_pdf_to_excel, convert_excel_to_csv,
               image_convert, any_to_images, image_supported_formats,
                // Audio
                convert_audio, convert_audio_batch, audio_probe_media, audio_supported_formats,
                audio_convert_batch_stream, audio_convert_batch_cancel,
                audio_ncm_convert, audio_ncm_convert_batch_stream, audio_ncm_convert_batch_cancel,
                audio_kgm_convert, audio_kgm_convert_batch_stream, audio_kgm_convert_batch_cancel,
                audio_unlock, audio_unlock_batch_stream, audio_unlock_batch_cancel,
            // Video
            video_convert, video_probe_info, video_supported_formats,
            video_convert_batch_stream, video_convert_batch_cancel,
            // OCR
            ocr_local, ocr_glm, ocr_pdf, ocr_batch, ocr_auto,
            // Bruteforce
            pdf_bruteforce, pdf_bruteforce_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
