use idcard_water::Service;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use std::{fs, io::Cursor};
use tempfile::TempDir;

fn source(dir: &TempDir, name: &str) -> std::path::PathBuf {
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(RgbImage::from_pixel(600, 400, Rgb([230, 230, 230])))
        .write_to(&mut out, ImageFormat::Png)
        .unwrap();
    let path = dir.path().join(name);
    fs::write(&path, out.into_inner()).unwrap();
    path
}

#[test]
fn import_is_atomic_limited_and_does_not_expose_paths() {
    let dir = TempDir::new().unwrap();
    let paths = vec![
        source(&dir, "front.png"),
        source(&dir, "back.png"),
        source(&dir, "extra.png"),
    ];
    let service = Service::new();
    assert!(service.import_paths(paths.clone()).is_err());
    assert!(service.sessions().is_empty());
    let views = service.import_paths(paths[..2].to_vec()).unwrap();
    assert_eq!(views.len(), 2);
    let serialized = serde_json::to_string(&views).unwrap();
    assert!(!serialized.contains(dir.path().to_str().unwrap()));
    assert!(!serialized.contains("bytes"));
    assert!(service.import_paths(vec![paths[2].clone()]).is_err());
    assert_eq!(service.sessions().len(), 2);
    service.remove_image(&views[0].id).unwrap();
    assert_eq!(
        service.import_paths(vec![paths[2].clone()]).unwrap().len(),
        2
    );
}

#[test]
fn invalid_batch_keeps_existing_state_and_input_is_a_snapshot() {
    let dir = TempDir::new().unwrap();
    let path = source(&dir, "front.png");
    let service = Service::new();
    let invalid = dir.path().join("invalid.png");
    fs::write(&invalid, b"broken").unwrap();
    assert!(service.import_paths(vec![path.clone(), invalid]).is_err());
    assert!(service.sessions().is_empty());
    let views = service.import_paths(vec![path.clone()]).unwrap();
    fs::write(path, b"external change").unwrap();
    assert!(service.confirmation_preview(&views[0].id).is_ok());
    service.remove_image(&views[0].id).unwrap();
    assert!(service.confirmation_preview(&views[0].id).is_err());
}
