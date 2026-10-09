//! NAIS 2 RELL: 폴더 관리자와 씬 폴더 새로고침에 쓰는 파일 목록 읽기.
//! 표준 라이브러리만 써서 `rustc --test`로 따로 검사할 수 있다.

use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

pub const IMAGE_EXTENSIONS: [&str; 4] = ["png", "webp", "jpg", "jpeg"];

#[derive(Debug, Clone, PartialEq)]
pub struct ImageFile {
    pub path: String,
    pub name: String,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FolderImages {
    pub folder: String,
    pub exists: bool,
    pub files: Vec<ImageFile>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Subfolder {
    pub name: String,
    pub path: String,
    pub image_count: usize,
    pub modified_ms: u64,
}

pub fn is_image_name(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((stem, extension)) => {
            !stem.is_empty()
                && IMAGE_EXTENSIONS
                    .iter()
                    .any(|known| known.eq_ignore_ascii_case(extension))
        }
        None => false,
    }
}

fn modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// 폴더 바로 아래의 이미지 파일들 (하위 폴더는 보지 않는다). 이름순.
pub fn list_image_files(folder: &str) -> FolderImages {
    let directory = Path::new(folder);
    let Ok(entries) = fs::read_dir(directory) else {
        return FolderImages {
            folder: folder.to_string(),
            exists: false,
            files: Vec::new(),
        };
    };
    let mut files: Vec<ImageFile> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if !path.is_file() || !is_image_name(&name) {
                return None;
            }
            Some(ImageFile {
                modified_ms: modified_ms(&path),
                path: path.to_string_lossy().to_string(),
                name,
            })
        })
        .collect();
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    FolderImages {
        folder: folder.to_string(),
        exists: true,
        files,
    }
}

/// 폴더 바로 아래의 하위 폴더들과 각 폴더에 든 이미지 수. 이름순.
pub fn list_subfolders(root: &str) -> Result<Vec<Subfolder>, String> {
    let entries = fs::read_dir(Path::new(root)).map_err(|error| error.to_string())?;
    let mut folders: Vec<Subfolder> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                return None;
            }
            let image_count = fs::read_dir(&path)
                .map(|children| {
                    children
                        .flatten()
                        .filter(|child| {
                            child.path().is_file()
                                && is_image_name(&child.file_name().to_string_lossy())
                        })
                        .count()
                })
                .unwrap_or(0);
            Some(Subfolder {
                modified_ms: modified_ms(&path),
                path: path.to_string_lossy().to_string(),
                name,
                image_count,
            })
        })
        .collect();
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(folders)
}

/// 내보낼 파일 이름으로 쓸 수 있는지: 경로 구분자나 상위 폴더로 빠지는 이름은 받지 않는다.
pub fn is_safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        && !name.ends_with([' ', '.'])
}

/// 불투명한 그림인지 (NovelAI가 알파 최하위 비트에 숨긴 정보 때문에 254도 불투명으로 본다).
pub fn is_opaque_rgba(rgba: &[u8]) -> bool {
    rgba.chunks_exact(4).all(|pixel| pixel[3] >= 254)
}

/// 투명한 그림을 그대로 둘 때, 알파 최하위 비트에 숨은 정보만 지운다.
pub fn clear_alpha_payload(rgba: &mut [u8]) {
    for pixel in rgba.chunks_exact_mut(4) {
        pixel[3] |= 1;
    }
}

pub fn rgba_to_rgb(rgba: &[u8]) -> Vec<u8> {
    let mut rgb = Vec::with_capacity(rgba.len() / 4 * 3);
    for pixel in rgba.chunks_exact(4) {
        rgb.extend_from_slice(&pixel[..3]);
    }
    rgb
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rell-native-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn recognises_image_names() {
        assert!(is_image_name("a.png"));
        assert!(is_image_name("NAIS_SCENE_1.WEBP"));
        assert!(is_image_name("x.y.jpeg"));
        assert!(!is_image_name("notes.txt"));
        assert!(!is_image_name("png"));
        assert!(!is_image_name(".png"));
    }

    #[test]
    fn lists_only_images_directly_inside() {
        let dir = temp_dir("images");
        fs::write(dir.join("b.png"), b"1").unwrap();
        fs::write(dir.join("A.webp"), b"1").unwrap();
        fs::write(dir.join("memo.txt"), b"1").unwrap();
        fs::create_dir_all(dir.join("nested")).unwrap();
        fs::write(dir.join("nested").join("c.png"), b"1").unwrap();

        let listed = list_image_files(&dir.to_string_lossy());
        assert!(listed.exists);
        let names: Vec<&str> = listed.files.iter().map(|file| file.name.as_str()).collect();
        assert_eq!(names, vec!["A.webp", "b.png"]);
        assert!(listed.files[0].modified_ms > 0);

        let missing = list_image_files(&dir.join("nope").to_string_lossy());
        assert!(!missing.exists);
        assert!(missing.files.is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn lists_subfolders_with_image_counts() {
        let dir = temp_dir("folders");
        fs::create_dir_all(dir.join("Work B")).unwrap();
        fs::create_dir_all(dir.join("work a")).unwrap();
        fs::create_dir_all(dir.join(".hidden")).unwrap();
        fs::write(dir.join("loose.png"), b"1").unwrap();
        fs::write(dir.join("Work B").join("1.webp"), b"1").unwrap();
        fs::write(dir.join("Work B").join("2.webp"), b"1").unwrap();
        fs::write(dir.join("Work B").join("readme.md"), b"1").unwrap();

        let folders = list_subfolders(&dir.to_string_lossy()).unwrap();
        let summary: Vec<(&str, usize)> = folders
            .iter()
            .map(|folder| (folder.name.as_str(), folder.image_count))
            .collect();
        assert_eq!(summary, vec![("work a", 0), ("Work B", 2)]);
        assert!(list_subfolders(&dir.join("nope").to_string_lossy()).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_unsafe_file_names() {
        assert!(is_safe_file_name("A1.webp"));
        assert!(is_safe_file_name("씬 1.webp"));
        assert!(!is_safe_file_name(""));
        assert!(!is_safe_file_name(".."));
        assert!(!is_safe_file_name("../a.webp"));
        assert!(!is_safe_file_name("a\\b.webp"));
        assert!(!is_safe_file_name("C:a.webp"));
        assert!(!is_safe_file_name("a.webp "));
    }

    #[test]
    fn drops_hidden_alpha_payload() {
        // NovelAI 숨은 정보: 알파가 254/255로 섞여 있다 → 불투명으로 보고 알파를 버린다.
        let stealth = [10, 20, 30, 255, 40, 50, 60, 254];
        assert!(is_opaque_rgba(&stealth));
        assert_eq!(rgba_to_rgb(&stealth), vec![10, 20, 30, 40, 50, 60]);

        // 진짜 투명한 그림은 알파를 남기되 최하위 비트만 고정한다.
        let mut transparent = [1, 2, 3, 0, 4, 5, 6, 128, 7, 8, 9, 254];
        assert!(!is_opaque_rgba(&transparent));
        clear_alpha_payload(&mut transparent);
        assert_eq!(transparent, [1, 2, 3, 1, 4, 5, 6, 129, 7, 8, 9, 255]);
    }
}
