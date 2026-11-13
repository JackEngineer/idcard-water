mod support;
use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
use std::io::Cursor;
use watermark_core::{
    decode, encode, preview, render, CoreError, OutputFormat, PreviewTarget, WatermarkDraft,
    WatermarkFont, WatermarkSpec,
};

#[test]
fn input_formats_dimensions_and_alpha_are_validated() {
    assert!(matches!(
        decode(b"not an image"),
        Err(CoreError::UnsupportedFormat)
    ));
    assert!(matches!(
        decode(&vec![0; 50 * 1024 * 1024 + 1]),
        Err(CoreError::InputTooLarge)
    ));
    let source = decode(&support::rgb_png(320, 200)).unwrap();
    assert_eq!(source.dimensions(), (320, 200));
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(RgbaImage::from_pixel(2, 2, Rgba([255, 0, 0, 0])))
        .write_to(&mut out, ImageFormat::Png)
        .unwrap();
    assert_eq!(decode(&out.into_inner()).unwrap().pixels(), &[255; 12]);
}

#[test]
fn grayscale_jpeg_and_profiled_grayscale_png_are_supported() {
    let mut jpeg = Cursor::new(Vec::new());
    DynamicImage::ImageLuma8(image::GrayImage::from_pixel(8, 8, image::Luma([128])))
        .write_to(&mut jpeg, ImageFormat::Jpeg)
        .unwrap();
    let plain = decode(&jpeg.into_inner()).unwrap();
    assert!(plain.pixels().iter().all(|v| (*v as i16 - 128).abs() <= 2));
    let mut info = png::Info::with_size(8, 8);
    info.color_type = png::ColorType::Grayscale;
    info.icc_profile = Some(std::borrow::Cow::Owned(
        moxcms::ColorProfile::new_gray_with_gamma(2.2)
            .encode()
            .unwrap(),
    ));
    let mut bytes = Vec::new();
    {
        let mut writer = png::Encoder::with_info(&mut bytes, info)
            .unwrap()
            .write_header()
            .unwrap();
        writer.write_image_data(&[128; 64]).unwrap();
    }
    let profiled = decode(&bytes).unwrap();
    assert!(profiled
        .pixels()
        .iter()
        .all(|v| (*v as i16 - 129).abs() <= 3));
}

#[test]
fn rejects_apng_without_processing_just_the_first_frame() {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 2, 2);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_animated(1, 0).unwrap();
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&[100; 12]).unwrap();
    }
    assert!(matches!(decode(&bytes), Err(CoreError::AnimatedInput)));
}

#[test]
fn validates_pixel_header_before_allocating_full_image() {
    let mut bytes = Vec::new();
    {
        let encoder = png::Encoder::new(&mut bytes, 100_000, 100_000);
        let writer = encoder.write_header().unwrap();
        drop(writer);
    }
    assert!(matches!(decode(&bytes), Err(CoreError::ImageTooLarge)));
}

#[test]
fn chinese_watermark_is_repeated_and_source_is_unchanged() {
    let source = decode(&support::rgb_png(1200, 800)).unwrap();
    let before = source.pixels().to_vec();
    let spec = WatermarkSpec::try_from(WatermarkDraft {
        text: "仅供测试单位办理测试业务使用\n2026-11-13".into(),
        ..WatermarkDraft::default()
    })
    .unwrap();
    let marked = render(&source, &spec, &WatermarkFont::bundled().unwrap()).unwrap();
    assert_eq!(marked.dimensions(), (1200, 800));
    assert_eq!(source.pixels(), before);
    for (x0, y0, x1, y1) in [
        (0, 0, 600, 400),
        (600, 0, 1200, 400),
        (0, 400, 600, 800),
        (600, 400, 1200, 800),
    ] {
        let changed = (y0..y1).any(|y| {
            (x0..x1).any(|x| {
                let i = ((y * 1200 + x) * 3) as usize;
                marked.pixels()[i..i + 3] != before[i..i + 3]
            })
        });
        assert!(changed, "watermark absent in quadrant");
    }
    let output = encode(&marked, OutputFormat::Png).unwrap();
    let reopened = image::load_from_memory(&output).unwrap().into_rgb8();
    assert_eq!(reopened.as_raw().as_slice(), marked.pixels());
    let inspected = preview(
        &marked,
        PreviewTarget::Detail {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        },
    )
    .unwrap();
    assert_eq!(
        image::load_from_memory(&inspected)
            .unwrap()
            .into_rgb8()
            .as_raw(),
        reopened.as_raw()
    );
    let fit = preview(&marked, PreviewTarget::Fit { max_edge: 300 }).unwrap();
    assert_eq!(image::load_from_memory(&fit).unwrap().width(), 300);
    assert!(matches!(
        preview(
            &marked,
            PreviewTarget::Detail {
                x: 1199,
                y: 0,
                width: 10,
                height: 10
            }
        ),
        Err(CoreError::InvalidPreview)
    ));
    let jpeg = encode(&marked, OutputFormat::Jpeg).unwrap();
    assert_eq!(
        image::load_from_memory(&jpeg)
            .unwrap()
            .into_rgb8()
            .dimensions(),
        (1200, 800)
    );
}

#[test]
fn all_eight_exif_orientations_match_fixed_corner_expectations() {
    let colors = [
        [220u8, 20, 20],
        [20, 220, 20],
        [20, 20, 220],
        [220, 220, 20],
    ];
    let expectations = [
        [0, 1, 2, 3],
        [1, 0, 3, 2],
        [3, 2, 1, 0],
        [2, 3, 0, 1],
        [0, 2, 1, 3],
        [2, 0, 3, 1],
        [3, 1, 2, 0],
        [1, 3, 0, 2],
    ];
    for orientation in 1u16..=8 {
        let pixels = image::RgbImage::from_fn(40, 20, |x, y| {
            image::Rgb(colors[(usize::from(y >= 10) * 2) + usize::from(x >= 20)])
        });
        let mut encoded = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(pixels)
            .write_to(&mut encoded, ImageFormat::Jpeg)
            .unwrap();
        let mut exif = b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0".to_vec();
        exif.extend(orientation.to_le_bytes());
        exif.extend([0; 6]);
        let mut bytes = vec![0xff, 0xd8, 0xff, 0xe1];
        bytes.extend(((exif.len() + 2) as u16).to_be_bytes());
        bytes.extend(exif);
        bytes.extend(&encoded.into_inner()[2..]);
        let normalized = decode(&bytes).unwrap();
        let (w, h) = normalized.dimensions();
        assert_eq!((w, h), if orientation >= 5 { (20, 40) } else { (40, 20) });
        for (corner, (x, y)) in [(3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)]
            .into_iter()
            .enumerate()
        {
            let offset = ((y * w + x) * 3) as usize;
            let expected = colors[expectations[orientation as usize - 1][corner]];
            for (a, b) in normalized.pixels()[offset..offset + 3].iter().zip(expected) {
                assert!(
                    (*a as i16 - b as i16).abs() < 35,
                    "orientation {orientation}, corner {corner}"
                );
            }
        }
    }
}

#[test]
fn embedded_display_p3_is_converted_to_srgb_with_independent_reference() {
    #[cfg(target_os = "macos")]
    let profile = std::fs::read("/System/Library/ColorSync/Profiles/Display P3.icc").unwrap();
    #[cfg(not(target_os = "macos"))]
    let profile = moxcms::ColorProfile::new_display_p3().encode().unwrap();
    let mut info = png::Info::with_size(4, 4);
    info.color_type = png::ColorType::Rgb;
    info.bit_depth = png::BitDepth::Eight;
    info.icc_profile = Some(std::borrow::Cow::Owned(profile));
    let mut bytes = Vec::new();
    {
        let mut writer = png::Encoder::with_info(&mut bytes, info)
            .unwrap()
            .write_header()
            .unwrap();
        writer
            .write_image_data(&[200u8, 40, 30].repeat(16))
            .unwrap();
    }
    let normalized = decode(&bytes).unwrap();
    for (actual, expected) in normalized.pixels()[..3].iter().zip([218u8, 0, 4]) {
        assert!((*actual as i16 - expected as i16).abs() <= 3);
    }
    #[cfg(target_os = "macos")]
    {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.verification/color");
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("p3.png");
        let reference = dir.join("sips-srgb.png");
        std::fs::write(&input, &bytes).unwrap();
        let output = std::process::Command::new("/usr/bin/sips")
            .args([
                "--matchTo",
                "/System/Library/ColorSync/Profiles/sRGB Profile.icc",
            ])
            .arg(&input)
            .arg("--out")
            .arg(&reference)
            .output()
            .unwrap();
        assert!(output.status.success());
        let rgb = image::open(reference).unwrap().into_rgb8();
        for (actual, expected) in normalized.pixels()[..3].iter().zip(rgb.get_pixel(0, 0).0) {
            assert!(
                (*actual as i16 - expected as i16).abs() <= 3,
                "ColorSync comparison: moxcms {:?}, ColorSync {:?}",
                &normalized.pixels()[..3],
                rgb.get_pixel(0, 0).0
            );
        }
    }
}

#[test]
fn rejects_mpf_and_corrupted_embedded_profiles() {
    let mut jpeg = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(image::RgbImage::new(8, 8))
        .write_to(&mut jpeg, ImageFormat::Jpeg)
        .unwrap();
    let mut mpf = vec![0xff, 0xd8, 0xff, 0xe2, 0, 6, b'M', b'P', b'F', 0];
    mpf.extend(&jpeg.into_inner()[2..]);
    assert!(matches!(decode(&mpf), Err(CoreError::AnimatedInput)));
    let mut info = png::Info::with_size(8, 8);
    info.color_type = png::ColorType::Rgb;
    info.icc_profile = Some(std::borrow::Cow::Owned(vec![1; 132]));
    let mut bytes = Vec::new();
    {
        let mut writer = png::Encoder::with_info(&mut bytes, info)
            .unwrap()
            .write_header()
            .unwrap();
        writer.write_image_data(&[90; 192]).unwrap();
    }
    assert!(matches!(decode(&bytes), Err(CoreError::ColorProfileFailed)));
}

#[test]
fn blank_confirmation_is_bounded_and_does_not_enable_encoding() {
    let source = decode(&support::rgb_png(1800, 1200)).unwrap();
    let bytes = watermark_core::confirmation_preview(&source).unwrap();
    use image::GenericImageView;
    assert_eq!(
        image::load_from_memory(&bytes).unwrap().dimensions(),
        (1600, 1067)
    );
}

#[test]
fn unsupported_glyphs_and_impossible_layout_are_not_exportable() {
    let source = decode(&support::rgb_png(100, 100)).unwrap();
    let font = WatermarkFont::bundled().unwrap();
    let missing = WatermarkSpec::try_from(WatermarkDraft {
        text: "🛸".into(),
        ..WatermarkDraft::default()
    })
    .unwrap();
    assert!(matches!(
        render(&source, &missing, &font),
        Err(CoreError::MissingGlyph)
    ));
    let impossible = WatermarkSpec::try_from(WatermarkDraft {
        text: "中".repeat(200),
        size_ratio: 0.12,
        ..WatermarkDraft::default()
    })
    .unwrap();
    assert!(matches!(
        render(&source, &impossible, &font),
        Err(CoreError::LayoutDoesNotFit)
    ));
}
