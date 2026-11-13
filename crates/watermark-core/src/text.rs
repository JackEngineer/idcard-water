use crate::{CoreError, WatermarkSpec};
use fontdue::{Font, FontSettings};
use std::sync::{Arc, OnceLock};

pub struct WatermarkFont(pub(crate) Arc<Font>);
impl WatermarkFont {
    pub fn bundled() -> Result<Self, CoreError> {
        static FONT: OnceLock<Result<Arc<Font>, CoreError>> = OnceLock::new();
        FONT.get_or_init(|| {
            Font::from_bytes(
                include_bytes!("../../../assets/fonts/NotoSansCJKsc-Regular.otf") as &[u8],
                FontSettings::default(),
            )
            .map(Arc::new)
            .map_err(|_| CoreError::MissingGlyph)
        })
        .clone()
        .map(Self)
    }
}
pub(crate) struct TextMask {
    pub width: usize,
    pub height: usize,
    pub pixels: Vec<u8>,
    pub font_size: f32,
}

pub(crate) fn layout(
    font: &WatermarkFont,
    spec: &WatermarkSpec,
    width: u32,
    height: u32,
) -> Result<TextMask, CoreError> {
    let size = ((width.min(height) as f32) * spec.0.size_ratio).max(8.0);
    let font = &font.0;
    for ch in spec.text().chars().filter(|c| !c.is_whitespace()) {
        if !font.has_glyph(ch) {
            return Err(CoreError::MissingGlyph);
        }
    }
    let max_width = width.min(height) as f32 * 0.78;
    let metrics = font
        .horizontal_line_metrics(size)
        .ok_or(CoreError::LayoutDoesNotFit)?;
    let line_height = metrics.new_line_size.max(size * 1.2).ceil();
    let mut lines: Vec<(Vec<char>, f32)> = Vec::new();
    for input in spec.text().split('\n') {
        let mut line = Vec::new();
        let mut advance = 0.0;
        for ch in input.chars() {
            let next = font.metrics(ch, size).advance_width;
            if !line.is_empty() && advance + next > max_width {
                lines.push((std::mem::take(&mut line), advance));
                advance = 0.0;
            }
            line.push(ch);
            advance += next;
        }
        lines.push((line, advance));
    }
    let pad = (size * 0.2).ceil() as usize + 2;
    let mask_width = lines
        .iter()
        .map(|(_, w)| w.ceil() as usize)
        .max()
        .unwrap_or(0)
        + pad * 2;
    let mask_height = (lines.len() as f32 * line_height).ceil() as usize + pad * 2;
    let angle = spec.0.angle_deg.to_radians();
    let bounding_width =
        mask_width as f32 * angle.cos().abs() + mask_height as f32 * angle.sin().abs();
    let bounding_height =
        mask_width as f32 * angle.sin().abs() + mask_height as f32 * angle.cos().abs();
    if bounding_width > width as f32
        || bounding_height > height as f32
        || mask_width * mask_height > 64_000_000
    {
        return Err(CoreError::LayoutDoesNotFit);
    }
    let mut mask = vec![0u8; mask_width * mask_height];
    for (row, (line, advance)) in lines.into_iter().enumerate() {
        let mut x = pad as f32 + (mask_width as f32 - (pad * 2) as f32 - advance) / 2.0;
        let baseline = pad as f32 + row as f32 * line_height + metrics.ascent;
        for ch in line {
            let (glyph, coverage) = font.rasterize(ch, size);
            let left = x.floor() as i32 + glyph.xmin;
            let top = (baseline - glyph.height as f32 - glyph.ymin as f32).round() as i32;
            for gy in 0..glyph.height {
                for gx in 0..glyph.width {
                    let (px, py) = (left + gx as i32, top + gy as i32);
                    if px >= 0 && py >= 0 && px < mask_width as i32 && py < mask_height as i32 {
                        let index = py as usize * mask_width + px as usize;
                        mask[index] = mask[index].max(coverage[gy * glyph.width + gx]);
                    }
                }
            }
            x += glyph.advance_width;
        }
    }
    Ok(TextMask {
        width: mask_width,
        height: mask_height,
        pixels: mask,
        font_size: size,
    })
}
