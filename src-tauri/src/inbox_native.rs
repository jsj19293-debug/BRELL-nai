//! 알림 모아보기(다른 플랫폼 댓글 관리)의 네이티브 부분.
//!
//! 파일 저장, 로그인 정보 암호화(Windows DPAPI), 로그인용 크롬/엣지 실행만 맡는다.
//! 표준 라이브러리만 쓰고 Tauri에 의존하지 않아서 `lib.rs`의 커맨드는 얇은 연결만 한다.
//! 동작 방식은 NAIS3-Custom(seotk0319, GPL-3.0)의 `src/main/notifications/direct`를 따른다.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 알림 저장소가 쓰는 파일. 이 이름 밖의 파일은 읽지도 쓰지도 않는다.
const STORE_FILES: [&str; 4] = [
    "inbox.json",
    "replied.json",
    "babe-works.json",
    "work-thumbs.json",
];

fn store_path(directory: &Path, name: &str) -> Result<PathBuf, String> {
    if STORE_FILES.contains(&name) {
        Ok(directory.join(name))
    } else {
        Err("UNAPPROVED_STORE_FILE".to_string())
    }
}

pub fn read_store_file(directory: &Path, name: &str) -> Result<Option<String>, String> {
    let path = store_path(directory, name)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("STORE_READ_FAILED: {error}")),
    }
}

/// 임시 파일에 쓴 뒤 바꿔치기한다. 직전 내용은 `.previous`로 남긴다.
pub fn write_store_file(directory: &Path, name: &str, data: &str) -> Result<(), String> {
    let path = store_path(directory, name)?;
    write_atomic(&path, data.as_bytes(), true)
}

fn write_atomic(path: &Path, bytes: &[u8], keep_previous: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("STORE_WRITE_FAILED: {error}"))?;
    }
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    std::fs::write(&temporary, bytes).map_err(|error| format!("STORE_WRITE_FAILED: {error}"))?;
    if keep_previous && path.exists() {
        let mut previous = path.as_os_str().to_owned();
        previous.push(".previous");
        // 백업 실패는 저장 자체를 막지 않는다.
        let _ = std::fs::copy(path, PathBuf::from(previous));
    }
    std::fs::rename(&temporary, path).map_err(|error| format!("STORE_WRITE_FAILED: {error}"))
}

/// 앱이 직접 요청을 보낼 수 있는 호스트. 9개 플랫폼과 그 플랫폼이 쓰는 인증·데이터 호스트뿐이다.
const HTTP_HOSTS: [&str; 14] = [
    "eden-chat.com",
    "jhbfalszdxacwjnrrvms.supabase.co",
    "babechat.ai",
    "babechatapi.com",
    "lunatalk.chat",
    "elyn.ai",
    "nekochat.xyz",
    "teapotchat.com",
    "firestore.googleapis.com",
    "securetoken.googleapis.com",
    "us-central1-chat-ai-7a275.cloudfunctions.net",
    "wrtn.ai",
    "rplay.live",
    "genit.ai",
];

pub fn host_allowed(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    HTTP_HOSTS.iter().any(|root| {
        host == *root
            || (host.len() > root.len()
                && host.ends_with(root)
                && host.as_bytes()[host.len() - root.len() - 1] == b'.')
    })
}

/// 로그인 창으로 열 수 있는 주소: https이고 허용된 플랫폼 호스트여야 한다.
pub fn sign_in_url_allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') || authority.contains(':') {
        return false;
    }
    host_allowed(authority)
}

// ---------------------------------------------------------------------------
// 로그인용 브라우저 (크롬, 없으면 엣지)
// ---------------------------------------------------------------------------

fn browser_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if cfg!(target_os = "windows") {
        let roots: Vec<PathBuf> = ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
            .iter()
            .filter_map(|name| std::env::var_os(name))
            .map(PathBuf::from)
            .collect();
        for root in &roots {
            candidates.push(
                root.join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe"),
            );
        }
        for root in &roots {
            candidates.push(
                root.join("Microsoft")
                    .join("Edge")
                    .join("Application")
                    .join("msedge.exe"),
            );
        }
    } else if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ));
        candidates.push(PathBuf::from(
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ));
    } else {
        for name in [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
        ] {
            candidates.push(PathBuf::from(name));
        }
    }
    candidates
}

pub fn find_browser() -> Option<PathBuf> {
    browser_candidates().into_iter().find(|path| path.is_file())
}

/// 이 프로필로 브라우저가 떠 있는지. 크롬은 실행 중에 프로필의 `lockfile`을 잡고 있다가
/// 종료하면 지운다 (Windows). 다른 OS는 `SingletonLock`이 남아 있는지로 본다.
pub fn profile_in_use(profile: &Path) -> bool {
    if cfg!(target_os = "windows") {
        match std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(profile.join("lockfile"))
        {
            Ok(_) => false,
            Err(error) => error.kind() != std::io::ErrorKind::NotFound,
        }
    } else {
        std::fs::symlink_metadata(profile.join("SingletonLock")).is_ok()
    }
}

fn base_command(executable: &Path, profile: &Path) -> Command {
    let mut command = Command::new(executable);
    let mut profile_argument = std::ffi::OsString::from("--user-data-dir=");
    profile_argument.push(profile.as_os_str());
    command
        .arg(profile_argument)
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}

/// 평범한 창으로 로그인 페이지를 연다. 원격 제어가 붙지 않아 구글 로그인이 거부되지 않는다.
/// 이미 이 프로필 창이 열려 있으면 그 창에 새 탭으로 열린다.
pub fn open_sign_in_window(profile: &Path, url: &str) -> Result<(), String> {
    if !sign_in_url_allowed(url) {
        return Err("UNAPPROVED_SIGN_IN_URL".to_string());
    }
    let executable = find_browser().ok_or_else(|| "BROWSER_NOT_FOUND".to_string())?;
    std::fs::create_dir_all(profile).map_err(|error| format!("BROWSER_START_TIMEOUT: {error}"))?;
    let mut child = base_command(&executable, profile)
        .arg(url)
        .spawn()
        .map_err(|error| format!("BROWSER_START_TIMEOUT: {error}"))?;
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(15) {
        if profile_in_use(profile) {
            return Ok(());
        }
        if let Ok(Some(status)) = child.try_wait() {
            if !status.success() {
                return Err("BROWSER_START_TIMEOUT".to_string());
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err("BROWSER_START_TIMEOUT".to_string())
}

/// 로그인 정보를 읽을 때만 잠깐 띄우는 DevTools 브라우저. 한 번에 하나만 있다.
static DEBUG_BROWSER: Mutex<Option<Child>> = Mutex::new(None);

fn debug_browser() -> std::sync::MutexGuard<'static, Option<Child>> {
    DEBUG_BROWSER
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 같은 프로필을 DevTools 포트와 함께 띄운다. 포트는 브라우저가 고르고
/// `DevToolsActivePort` 파일에 적는다 (`debug_endpoint`로 읽는다).
pub fn launch_debug_browser(profile: &Path, allow_origins: &str) -> Result<(), String> {
    let executable = find_browser().ok_or_else(|| "BROWSER_NOT_FOUND".to_string())?;
    std::fs::create_dir_all(profile).map_err(|error| format!("BROWSER_START_TIMEOUT: {error}"))?;
    let mut slot = debug_browser();
    if let Some(child) = slot.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return Ok(());
        }
    }
    *slot = None;
    // 평범한 창이 이 프로필을 잡고 있으면 새 실행이 그 창으로 흡수돼 버린다.
    if profile_in_use(profile) {
        return Err("BROWSER_ALREADY_OPEN".to_string());
    }
    let _ = std::fs::remove_file(profile.join("DevToolsActivePort"));
    let origins: String = allow_origins
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '/' | '.' | ',' | '-'))
        .collect();
    let child = base_command(&executable, profile)
        .arg("--remote-debugging-port=0")
        .arg(format!("--remote-allow-origins={origins}"))
        .arg("about:blank")
        .spawn()
        .map_err(|error| format!("BROWSER_START_TIMEOUT: {error}"))?;
    *slot = Some(child);
    Ok(())
}

/// DevTools 주소 `(포트, 경로)`. 아직 파일이 없으면 None.
pub fn debug_endpoint(profile: &Path) -> Option<(u16, String)> {
    let text = std::fs::read_to_string(profile.join("DevToolsActivePort")).ok()?;
    let mut lines = text.lines();
    let port = lines.next()?.trim().parse::<u16>().ok()?;
    let path = lines.next()?.trim();
    if path.starts_with("/devtools/browser/") {
        Some((port, path.to_string()))
    } else {
        None
    }
}

pub fn debug_browser_alive() -> bool {
    match debug_browser().as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(None)),
        None => false,
    }
}

/// 브라우저가 스스로 끝나기를 기다린다. 끝났으면 true.
pub fn wait_debug_browser_exit(timeout: Duration) -> bool {
    let started = Instant::now();
    loop {
        {
            let mut slot = debug_browser();
            match slot.as_mut() {
                None => return true,
                Some(child) => {
                    if !matches!(child.try_wait(), Ok(None)) {
                        *slot = None;
                        return true;
                    }
                }
            }
        }
        if started.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

pub fn kill_debug_browser() {
    let mut slot = debug_browser();
    if let Some(child) = slot.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *slot = None;
}

// ---------------------------------------------------------------------------
// 로그인 정보 보관함: Windows 사용자 계정 키(DPAPI)로만 암호화해서 저장한다.
// ---------------------------------------------------------------------------

const VAULT_MAGIC: &[u8; 8] = b"NAISVLT1";

#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            data_in: *const DataBlob,
            description: *const u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *const c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            data_in: *const DataBlob,
            description: *mut *mut u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *const c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    fn run(data: &[u8], protect: bool) -> Result<Vec<u8>, String> {
        let length = u32::try_from(data.len()).map_err(|_| "VAULT_TOO_LARGE".to_string())?;
        let input = DataBlob {
            cb_data: length,
            pb_data: data.as_ptr() as *mut u8,
        };
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };
        // SAFETY: input은 호출 동안 살아 있는 슬라이스를 가리키고 Windows는 이를 읽기만 한다.
        // output은 Windows가 할당하며, 복사한 뒤 LocalFree로 돌려준다.
        let ok = unsafe {
            if protect {
                CryptProtectData(
                    &input,
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            }
        };
        if ok == 0 || output.pb_data.is_null() {
            return Err(if protect {
                "ENCRYPTION_UNAVAILABLE".to_string()
            } else {
                "UNSUPPORTED_SESSION_STORE".to_string()
            });
        }
        // SAFETY: 성공하면 output은 cb_data 바이트의 유효한 버퍼다.
        let bytes =
            unsafe { std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec() };
        // SAFETY: Windows가 LocalAlloc으로 할당한 버퍼를 한 번만 해제한다.
        unsafe {
            LocalFree(output.pb_data as *mut c_void);
        }
        Ok(bytes)
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        run(data, true)
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        run(data, false)
    }
}

#[cfg(not(windows))]
mod dpapi {
    pub fn protect(_data: &[u8]) -> Result<Vec<u8>, String> {
        Err("ENCRYPTION_UNAVAILABLE".to_string())
    }

    pub fn unprotect(_data: &[u8]) -> Result<Vec<u8>, String> {
        Err("ENCRYPTION_UNAVAILABLE".to_string())
    }
}

pub fn vault_load(file: &Path) -> Result<Option<String>, String> {
    let raw = match std::fs::read(file) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("UNSUPPORTED_SESSION_STORE: {error}")),
    };
    let Some(sealed) = raw.strip_prefix(VAULT_MAGIC) else {
        return Err("UNSUPPORTED_SESSION_STORE".to_string());
    };
    let bytes = dpapi::unprotect(sealed)?;
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "UNSUPPORTED_SESSION_STORE".to_string())
}

pub fn vault_save(file: &Path, data: &str) -> Result<(), String> {
    let sealed = dpapi::protect(data.as_bytes())?;
    let mut bytes = Vec::with_capacity(VAULT_MAGIC.len() + sealed.len());
    bytes.extend_from_slice(VAULT_MAGIC);
    bytes.extend_from_slice(&sealed);
    write_atomic(file, &bytes, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_platform_hosts() {
        assert!(host_allowed("www.eden-chat.com"));
        assert!(host_allowed("api.babechatapi.com"));
        assert!(host_allowed("crack-api.wrtn.ai"));
        assert!(host_allowed("FIRESTORE.googleapis.com"));
        assert!(!host_allowed("googleapis.com"));
        assert!(!host_allowed("evil-genit.ai"));
        assert!(!host_allowed("genit.ai.example.com"));
        assert!(!host_allowed(""));
    }

    #[test]
    fn sign_in_urls_must_be_https_platform_pages() {
        assert!(sign_in_url_allowed("https://babechat.ai/notification?tab=my"));
        assert!(sign_in_url_allowed("https://www.eden-chat.com/"));
        assert!(!sign_in_url_allowed("http://babechat.ai/"));
        assert!(!sign_in_url_allowed("https://user@babechat.ai/"));
        assert!(!sign_in_url_allowed("https://example.com/"));
        assert!(!sign_in_url_allowed("--remote-debugging-port=1"));
    }

    #[test]
    fn store_files_are_fixed_and_written_atomically() {
        let directory = std::env::temp_dir().join(format!(
            "nais2-forge-inbox-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&directory);
        assert_eq!(read_store_file(&directory, "inbox.json").unwrap(), None);
        write_store_file(&directory, "inbox.json", "{\"a\":1}").unwrap();
        write_store_file(&directory, "inbox.json", "{\"a\":2}").unwrap();
        assert_eq!(
            read_store_file(&directory, "inbox.json").unwrap().as_deref(),
            Some("{\"a\":2}")
        );
        assert_eq!(
            std::fs::read_to_string(directory.join("inbox.json.previous")).unwrap(),
            "{\"a\":1}"
        );
        assert!(read_store_file(&directory, "../secret.json").is_err());
        assert!(write_store_file(&directory, "direct-sessions.bin", "x").is_err());
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn reads_the_devtools_endpoint_file() {
        let directory = std::env::temp_dir().join(format!(
            "nais2-forge-inbox-port-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        assert_eq!(debug_endpoint(&directory), None);
        std::fs::write(
            directory.join("DevToolsActivePort"),
            "51234\n/devtools/browser/abc-123\n",
        )
        .unwrap();
        assert_eq!(
            debug_endpoint(&directory),
            Some((51234, "/devtools/browser/abc-123".to_string()))
        );
        std::fs::write(directory.join("DevToolsActivePort"), "51234\n/other\n").unwrap();
        assert_eq!(debug_endpoint(&directory), None);
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[cfg(not(windows))]
    #[test]
    fn vault_refuses_to_store_without_os_encryption() {
        let file = std::env::temp_dir().join(format!("nais2-forge-vault-{}.bin", std::process::id()));
        assert_eq!(vault_save(&file, "{}").unwrap_err(), "ENCRYPTION_UNAVAILABLE");
        assert_eq!(vault_load(&file).unwrap(), None);
    }
}
