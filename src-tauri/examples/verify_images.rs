use idcard_water::Service;
use image::{Rgb, RgbImage};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
};
use watermark_core::{OutputFormat, PreviewTarget, WatermarkDraft};

fn label(image: &mut RgbImage, font: &fontdue::Font, text: &str, x: i32, y: i32, size: f32) {
    let mut pen = x;
    for c in text.chars() {
        let (metrics, bitmap) = font.rasterize(c, size);
        for row in 0..metrics.height {
            for col in 0..metrics.width {
                let px = pen + metrics.xmin + col as i32;
                let py = y + size as i32 - metrics.height as i32 - metrics.ymin + row as i32;
                if px < 0 || py < 0 || px >= image.width() as i32 || py >= image.height() as i32 {
                    continue;
                }
                let a = bitmap[row * metrics.width + col] as u32;
                let pixel = image.get_pixel_mut(px as u32, py as u32);
                for channel in &mut pixel.0 {
                    *channel = ((*channel as u32 * (255 - a) + 55 * a) / 255) as u8;
                }
            }
        }
        pen += metrics.advance_width.round() as i32;
    }
}
fn fixture(path: &Path, back: bool) {
    let font = fontdue::Font::from_bytes(
        include_bytes!("../../assets/fonts/NotoSansCJKsc-Regular.otf") as &[u8],
        fontdue::FontSettings::default(),
    )
    .unwrap();
    let mut image = RgbImage::from_fn(1200, 800, |x, y| {
        if (70..1130).contains(&x) && (65..735).contains(&y) {
            Rgb([237, 242, 229])
        } else {
            Rgb([220, 228, 214])
        }
    });
    label(&mut image, &font, "合成证件样本", 125, 110, 47.0);
    label(
        &mut image,
        &font,
        "仅用于软件验收 · 非真实身份证件",
        125,
        185,
        23.0,
    );
    label(
        &mut image,
        &font,
        if back {
            "背面 · TEST BACK"
        } else {
            "正面 · TEST FRONT"
        },
        125,
        275,
        30.0,
    );
    for (index, text) in [
        "姓名：测试用户",
        "用途：本地水印功能验收",
        "号码：000000 00000000 0000",
        "所有信息均为虚构",
    ]
    .iter()
    .enumerate()
    {
        label(&mut image, &font, text, 125, 355 + index as i32 * 70, 27.0);
    }
    image.save(path).unwrap();
}
fn draft(value: &Value) -> WatermarkDraft {
    WatermarkDraft {
        text: value["text"].as_str().unwrap_or("").into(),
        opacity: value["opacity"].as_f64().unwrap_or(0.24) as f32,
        angle_deg: value["angleDeg"].as_f64().unwrap_or(-30.0) as f32,
        size_ratio: value["sizeRatio"].as_f64().unwrap_or(0.035) as f32,
        color: [0, 1, 2].map(|i| value["color"][i].as_u64().unwrap_or(80) as u8),
    }
}
fn target(value: &Value) -> PreviewTarget {
    if value["kind"] == "detail" {
        PreviewTarget::Detail {
            x: value["x"].as_u64().unwrap_or(0) as u32,
            y: value["y"].as_u64().unwrap_or(0) as u32,
            width: value["width"].as_u64().unwrap_or(900) as u32,
            height: value["height"].as_u64().unwrap_or(600) as u32,
        }
    } else {
        PreviewTarget::Fit { max_edge: 1600 }
    }
}
fn response(
    mut stream: TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    write!(stream,"HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",body.len())?;
    stream.write_all(body)
}
fn serve(service: Service, front: PathBuf, back: PathBuf, output: PathBuf) -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:1421")?;
    println!("SYNTHETIC_VERIFY_READY");
    for stream in listener.incoming() {
        let stream = stream?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(10)))?;
        let mut reader = BufReader::new(stream.try_clone()?);
        let mut line = String::new();
        reader.read_line(&mut line)?;
        let action = line
            .split_whitespace()
            .nth(1)
            .unwrap_or("")
            .trim_start_matches("/__verification/")
            .to_string();
        let mut length = 0;
        let mut header_bytes = 0;
        let mut allowed = true;
        loop {
            line.clear();
            if reader.read_line(&mut line)? == 0 || line == "\r\n" {
                break;
            }
            header_bytes += line.len();
            if header_bytes > 8192 {
                allowed = false;
                break;
            }
            if let Some((key, value)) = line.split_once(':') {
                if key.eq_ignore_ascii_case("content-length") {
                    length = value.trim().parse::<usize>().unwrap_or(usize::MAX);
                }
                if key.eq_ignore_ascii_case("origin")
                    && !matches!(
                        value.trim(),
                        "http://localhost:1420" | "http://127.0.0.1:1420"
                    )
                {
                    allowed = false;
                }
            }
        }
        if !allowed || length > 16384 {
            response(
                stream,
                "400 Bad Request",
                "text/plain",
                b"invalid verification request",
            )?;
            continue;
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body)?;
        let input: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
        let result = match action.as_str() {
            "get_sessions" => Ok(serde_json::to_value(service.sessions()).unwrap()),
            "choose_images" => service
                .import_paths(vec![if service.sessions().is_empty() {
                    front.clone()
                } else {
                    back.clone()
                }])
                .map(|v| json!(v)),
            "remove_image" => service
                .remove_image(input["sessionId"].as_str().unwrap_or(""))
                .map(|v| json!(v)),
            "choose_export_directory" => service
                .authorize_directory(output.clone())
                .map(|v| json!(v)),
            "start_export" => service
                .start_export(
                    input["sessionIds"]
                        .as_array()
                        .map(|v| {
                            v.iter()
                                .filter_map(|id| id.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default(),
                    draft(&input["watermark"]),
                    if input["format"] == "png" {
                        OutputFormat::Png
                    } else {
                        OutputFormat::Jpeg
                    },
                    input["directoryToken"].as_str().unwrap_or(""),
                )
                .map(|v| json!(v)),
            "retry_export" => service
                .retry_export(
                    input["batchId"].as_str().unwrap_or("").into(),
                    input["directoryToken"].as_str().unwrap_or("").into(),
                )
                .map(|v| json!(v)),
            "request_preview" => {
                let result = service.request_preview(
                    input["sessionId"].as_str().unwrap_or("").into(),
                    input["revision"].as_u64().unwrap_or(0),
                    if input["watermark"].is_null() {
                        None
                    } else {
                        Some(draft(&input["watermark"]))
                    },
                    target(&input["target"]),
                );
                match result {
                    Ok(bytes) => {
                        response(stream, "200 OK", "image/png", &bytes)?;
                        continue;
                    }
                    Err(error) => Err(error),
                }
            }
            _ => Err(idcard_water::AppError {
                code: "unknown_action",
                message: "仅允许合成图片验收操作".into(),
            }),
        };
        let value = match result {
            Ok(value) => json!({"value":value}),
            Err(error) => json!({"error":error}),
        };
        response(
            stream,
            "200 OK",
            "application/json",
            &serde_json::to_vec(&value)?,
        )?;
    }
    Ok(())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.verification");
    fs::create_dir_all(&root)?;
    let directory = tempfile::Builder::new()
        .prefix("synthetic-")
        .tempdir_in(&root)?
        .keep();
    let front = directory.join("合成正面.jpg");
    let back = directory.join("合成背面.png");
    fixture(&front, false);
    fixture(&back, true);
    let output = directory.join("exports");
    fs::create_dir(&output)?;
    let service = Service::new();
    if std::env::args().any(|arg| arg == "--serve") {
        serve(service, front, back, output)?;
        return Ok(());
    }
    if std::env::args().any(|arg| arg == "--metadata") {
        let thumbnail = directory.join("thumbnail.jpg");
        image::open(&front)?.thumbnail(160, 120).save(&thumbnail)?;
        let result = std::process::Command::new("exiftool")
            .args([
                "-overwrite_original",
                "-GPSLatitude=1.25",
                "-GPSLatitudeRef=N",
                "-GPSLongitude=2.5",
                "-GPSLongitudeRef=E",
                "-Orientation#=6",
                "-XMP-dc:Description=SYNTHETIC-METADATA-TEST",
                "-IPTC:Keywords=SYNTHETIC",
                "-Comment=SYNTHETIC-ONLY",
            ])
            .arg(format!("-ThumbnailImage<={}", thumbnail.display()))
            .arg(&front)
            .output()?;
        if !result.status.success() {
            return Err("synthetic metadata injection failed".into());
        }
    }
    let sessions = service
        .import_paths(vec![front.clone(), back.clone()])
        .map_err(|e| e.message)?;
    let draft = WatermarkDraft {
        text: "仅供测试单位办理软件验收使用\n2026-11-13".into(),
        ..WatermarkDraft::default()
    };
    let token = service
        .authorize_directory(output.clone())
        .map_err(|e| e.message)?;
    let ids: Vec<_> = sessions.iter().map(|s| s.id.clone()).collect();
    let jpeg = service
        .start_export(ids.clone(), draft.clone(), OutputFormat::Jpeg, &token)
        .map_err(|e| e.message)?;
    let png = service
        .start_export(ids, draft.clone(), OutputFormat::Png, &token)
        .map_err(|e| e.message)?;
    let preview = service
        .request_preview(
            sessions[0].id.clone(),
            1,
            Some(draft),
            PreviewTarget::Fit { max_edge: 1200 },
        )
        .map_err(|e| e.message)?;
    let sample = directory.join("watermarked-preview.png");
    fs::write(&sample, preview)?;
    let files = fs::read_dir(&output)?
        .map(|p| p.map(|p| p.path()))
        .collect::<Result<Vec<_>, _>>()?;
    let manifest = json!({"source":front,"outputs":files,"preview":sample,"jpeg":jpeg,"png":png});
    fs::write(
        root.join("fixture-manifest.json"),
        serde_json::to_vec_pretty(&manifest)?,
    )?;
    println!("{}", serde_json::to_string(&manifest)?);
    Ok(())
}
