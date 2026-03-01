// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

// ── Global bruteforce process handle (for cancellation) ───────────────────────

static BRUTEFORCE_CHILD: std::sync::LazyLock<Arc<Mutex<Option<std::process::Child>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

/// Resolve python interpreter and script path by walking up from cwd.
fn resolve_python_and_script(script: &str) -> (String, String) {
    let python = std::env::current_dir()
        .ok()
        .and_then(|d| {
            let mut p = d.clone();
            for _ in 0..5 {
                let venv = p.join("python/venv/bin/python3");
                if venv.exists() {
                    return Some(venv.to_string_lossy().to_string());
                }
                if !p.pop() { break; }
            }
            None
        })
        .unwrap_or_else(|| "python3".to_string());

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
fn pdf_to_docx(params: String) -> Result<String, String> {
    run_python_handler("pdf_handler.py", "to_docx", &params)
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
fn convert_excel_to_csv(params: String) -> Result<String, String> {
    run_python_handler("convert_handler.py", "excel_to_csv", &params)
}

// ── OCR Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
fn ocr_local(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "local", &params)
}

#[tauri::command]
fn ocr_baidu(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "baidu", &params)
}

#[tauri::command]
fn ocr_pdf(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "pdf", &params)
}

#[tauri::command]
fn ocr_batch(params: String) -> Result<String, String> {
    run_python_handler("ocr_handler.py", "batch", &params)
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // PDF
            pdf_merge, pdf_split, pdf_encrypt, pdf_decrypt,
            pdf_compress, pdf_watermark, pdf_page_numbers,
            pdf_to_docx, pdf_info,
            // Convert
            convert_word_to_pdf, convert_excel_to_pdf, convert_pptx_to_pdf,
            convert_pdf_to_markdown, convert_images_to_pdf,
            convert_html_to_pdf, convert_excel_to_csv,
            // OCR
            ocr_local, ocr_baidu, ocr_pdf, ocr_batch,
            // Bruteforce
            pdf_bruteforce, pdf_bruteforce_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
