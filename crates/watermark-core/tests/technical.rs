use fontdue::{Font, FontSettings};
use moxcms::{ColorProfile, Layout, TransformOptions};

#[test]
fn bundled_chinese_font_rasterizes_all_required_characters() {
    let font = Font::from_bytes(
        include_bytes!("../../../assets/fonts/NotoSansCJKsc-Regular.otf") as &[u8],
        FontSettings::default(),
    )
    .unwrap();
    for ch in "仅供办理入职使用2026-11-13".chars() {
        assert!(font.has_glyph(ch), "missing {ch}");
        let (_, mask) = font.rasterize(ch, 32.0);
        assert!(mask.iter().any(|p| *p > 0));
    }
}

#[test]
fn srgb_color_transform_preserves_known_rgb_patch() {
    let source = ColorProfile::new_srgb();
    let transform = source
        .create_transform_8bit(
            Layout::Rgb,
            &ColorProfile::new_srgb(),
            Layout::Rgb,
            TransformOptions::default(),
        )
        .unwrap();
    let input = [37u8, 123, 211];
    let mut output = [0u8; 3];
    transform.transform(&input, &mut output).unwrap();
    for (a, b) in input.iter().zip(output) {
        assert!((*a as i16 - b as i16).abs() <= 1);
    }
}
