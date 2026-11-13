use crate::CoreError;
use image::{DynamicImage, RgbImage};
use moxcms::{ColorProfile, DataColorSpace, Layout, TransformOptions};

pub(crate) fn normalize(image: DynamicImage, icc: Option<&[u8]>) -> Result<RgbImage, CoreError> {
    let rgba = image.to_rgba8();
    let mut rgb = image.to_rgb8();
    if let Some(bytes) = icc {
        if bytes.len() > 4 * 1024 * 1024 {
            return Err(CoreError::ColorProfileFailed);
        }
        let profile =
            ColorProfile::new_from_slice(bytes).map_err(|_| CoreError::ColorProfileFailed)?;
        let (source, layout) = match profile.color_space {
            DataColorSpace::Rgb => (rgb.as_raw().clone(), Layout::Rgb),
            DataColorSpace::Gray if image.color().channel_count() <= 2 => {
                (image.to_luma8().into_raw(), Layout::Gray)
            }
            _ => return Err(CoreError::ColorProfileFailed),
        };
        let transform = profile
            .create_transform_8bit(
                layout,
                &ColorProfile::new_srgb(),
                Layout::Rgb,
                TransformOptions::default(),
            )
            .map_err(|_| CoreError::ColorProfileFailed)?;
        transform
            .transform(&source, rgb.as_mut())
            .map_err(|_| CoreError::ColorProfileFailed)?;
    }
    for (pixel, original) in rgb.pixels_mut().zip(rgba.pixels()) {
        let a = original[3] as u32;
        for channel in &mut pixel.0 {
            *channel = ((*channel as u32 * a + 255 * (255 - a) + 127) / 255) as u8;
        }
    }
    Ok(rgb)
}
