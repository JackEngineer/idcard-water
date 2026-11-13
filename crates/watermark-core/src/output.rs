use crate::{CoreError, OutputFormat, PreviewTarget, WatermarkedImage};
use image::{
    codecs::jpeg::JpegEncoder,
    imageops::{self, FilterType},
    DynamicImage, ImageFormat, RgbImage,
};
use std::io::Cursor;

pub fn confirmation_preview(image: &crate::NormalizedImage) -> Result<Vec<u8>, CoreError> {
    preview_pixels(&image.0, PreviewTarget::Fit { max_edge: 1600 })
}

pub fn encode(image: &WatermarkedImage, format: OutputFormat) -> Result<Vec<u8>, CoreError> {
    match format {
        OutputFormat::Png => png(&image.0),
        OutputFormat::Jpeg => {
            let mut bytes = Vec::new();
            JpegEncoder::new_with_quality(&mut bytes, 95)
                .encode_image(&image.0)
                .map_err(|_| CoreError::EncodeFailed)?;
            Ok(bytes)
        }
    }
}
pub fn preview(image: &WatermarkedImage, target: PreviewTarget) -> Result<Vec<u8>, CoreError> {
    preview_pixels(&image.0, target)
}

pub(crate) fn preview_pixels(
    image: &RgbImage,
    target: PreviewTarget,
) -> Result<Vec<u8>, CoreError> {
    let (w, h) = image.dimensions();
    let result = match target {
        PreviewTarget::Fit { max_edge } => {
            if max_edge == 0 || max_edge > 1600 {
                return Err(CoreError::InvalidPreview);
            }
            let ratio = (max_edge as f64 / w.max(h) as f64).min(1.0);
            imageops::resize(
                image,
                ((w as f64 * ratio).round() as u32).max(1),
                ((h as f64 * ratio).round() as u32).max(1),
                FilterType::Triangle,
            )
        }
        PreviewTarget::Detail {
            x,
            y,
            width,
            height,
        } => {
            if width == 0
                || height == 0
                || width > 2400
                || height > 2400
                || x.checked_add(width).is_none_or(|v| v > w)
                || y.checked_add(height).is_none_or(|v| v > h)
            {
                return Err(CoreError::InvalidPreview);
            }
            imageops::crop_imm(image, x, y, width, height).to_image()
        }
    };
    png(&result)
}
fn png(image: &RgbImage) -> Result<Vec<u8>, CoreError> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(image.clone())
        .write_to(&mut bytes, ImageFormat::Png)
        .map_err(|_| CoreError::EncodeFailed)?;
    Ok(bytes.into_inner())
}
