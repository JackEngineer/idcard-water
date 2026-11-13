use idcard_water::Service;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use std::{fs, io::Cursor};
use tempfile::TempDir;
use watermark_core::{OutputFormat, WatermarkDraft};

fn service_with_image(dir: &TempDir) -> (Service, String, std::path::PathBuf) {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(RgbImage::from_pixel(600, 400, Rgb([240; 3])))
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    let path = dir.path().join("front.png");
    fs::write(&path, bytes.into_inner()).unwrap();
    let service = Service::new();
    let id = service.import_paths(vec![path.clone()]).unwrap()[0]
        .id
        .clone();
    (service, id, path)
}
fn draft() -> WatermarkDraft {
    WatermarkDraft {
        text: "仅供测试使用".into(),
        ..WatermarkDraft::default()
    }
}

#[test]
fn exporting_never_overwrites_sources_or_existing_targets() {
    let dir = TempDir::new().unwrap();
    let (service, id, path) = service_with_image(&dir);
    let before = fs::read(&path).unwrap();
    let occupied = dir.path().join("front_watermarked.png");
    fs::write(&occupied, b"existing").unwrap();
    let token = service
        .authorize_directory(dir.path().to_path_buf())
        .unwrap();
    let report = service
        .start_export(vec![id], draft(), OutputFormat::Png, &token)
        .unwrap();
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::read(&occupied).unwrap(), b"existing");
    let output = dir.path().join("front_watermarked_1.png");
    assert!(image::open(output).is_ok());
    assert!(serde_json::to_string(&report).unwrap().contains("success"));
    assert!(fs::read_dir(dir.path()).unwrap().all(|p| !p
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".tmp")));
}

#[test]
fn empty_watermark_and_unknown_directory_cannot_write_files() {
    let dir = TempDir::new().unwrap();
    let (service, id, _) = service_with_image(&dir);
    let token = service
        .authorize_directory(dir.path().to_path_buf())
        .unwrap();
    assert!(service
        .start_export(
            vec![id.clone()],
            WatermarkDraft::default(),
            OutputFormat::Png,
            &token
        )
        .is_err());
    assert!(service
        .start_export(vec![id], draft(), OutputFormat::Png, "arbitrary-path")
        .is_err());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn failed_batch_can_retry_with_another_directory_without_reexporting_successes() {
    let dir = TempDir::new().unwrap();
    let (service, id, _) = service_with_image(&dir);
    let vanished = dir.path().join("vanished");
    fs::create_dir(&vanished).unwrap();
    let token = service.authorize_directory(vanished.clone()).unwrap();
    fs::remove_dir(vanished).unwrap();
    let first = service
        .start_export(vec![id], draft(), OutputFormat::Png, &token)
        .unwrap();
    assert!(serde_json::to_string(&first).unwrap().contains("failed"));
    let token = service
        .authorize_directory(dir.path().to_path_buf())
        .unwrap();
    let retried = service.retry_export(first.batch_id, token.clone()).unwrap();
    assert!(serde_json::to_string(&retried).unwrap().contains("success"));
    service.retry_export(retried.batch_id, token).unwrap();
    assert!(!dir.path().join("front_watermarked_1.png").exists());
}

#[test]
fn removed_inputs_cannot_be_resurrected_by_retry() {
    let dir = TempDir::new().unwrap();
    let (service, id, _) = service_with_image(&dir);
    let vanished = dir.path().join("vanished");
    fs::create_dir(&vanished).unwrap();
    let token = service.authorize_directory(vanished.clone()).unwrap();
    fs::remove_dir(vanished).unwrap();
    let report = service
        .start_export(vec![id.clone()], draft(), OutputFormat::Png, &token)
        .unwrap();
    service.remove_image(&id).unwrap();
    let token = service
        .authorize_directory(dir.path().to_path_buf())
        .unwrap();
    let report = service.retry_export(report.batch_id, token).unwrap();
    assert!(serde_json::to_string(&report)
        .unwrap()
        .contains("image_removed"));
    assert!(!dir.path().join("front_watermarked.png").exists());
}

#[test]
fn partial_success_is_preserved_when_the_failed_image_is_retried() {
    let dir = TempDir::new().unwrap();
    let (service, id, _) = service_with_image(&dir);
    let tiny = dir.path().join("tiny.png");
    RgbImage::from_pixel(2, 2, Rgb([240; 3]))
        .save(&tiny)
        .unwrap();
    let images = service.import_paths(vec![tiny]).unwrap();
    let token = service
        .authorize_directory(dir.path().to_path_buf())
        .unwrap();
    let report = service
        .start_export(
            images.iter().map(|image| image.id.clone()).collect(),
            draft(),
            OutputFormat::Png,
            &token,
        )
        .unwrap();
    assert!(
        matches!(&report.results[0],idcard_water::ExportItem::Success{session_id,..} if session_id==&id)
    );
    assert!(matches!(
        &report.results[1],
        idcard_water::ExportItem::Failed { .. }
    ));
    assert!(dir.path().join("front_watermarked.png").is_file());
    let report = service.retry_export(report.batch_id, token).unwrap();
    assert!(matches!(
        report.results[0],
        idcard_water::ExportItem::Success { .. }
    ));
    assert!(matches!(
        report.results[1],
        idcard_water::ExportItem::Failed { .. }
    ));
    assert!(!dir.path().join("front_watermarked_1.png").exists());
}

#[cfg(unix)]
#[test]
fn existing_symlinks_are_not_followed_or_replaced() {
    let dir = TempDir::new().unwrap();
    let (service, id, source) = service_with_image(&dir);
    let before = fs::read(&source).unwrap();
    std::os::unix::fs::symlink(&source, dir.path().join("front_watermarked.png")).unwrap();
    let token = service
        .authorize_directory(dir.path().to_path_buf())
        .unwrap();
    service
        .start_export(vec![id], draft(), OutputFormat::Png, &token)
        .unwrap();
    assert_eq!(fs::read(source).unwrap(), before);
    assert!(
        fs::symlink_metadata(dir.path().join("front_watermarked.png"))
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert!(dir.path().join("front_watermarked_1.png").is_file());
}
