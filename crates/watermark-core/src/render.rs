use crate::{text, CoreError, NormalizedImage, WatermarkFont, WatermarkSpec, WatermarkedImage};

pub fn render(
    image: &NormalizedImage,
    spec: &WatermarkSpec,
    font: &WatermarkFont,
) -> Result<WatermarkedImage, CoreError> {
    let (width, height) = image.dimensions();
    let mask = text::layout(font, spec, width, height)?;
    let mut output = image.0.clone();
    let (sin, cos) = spec.0.angle_deg.to_radians().sin_cos();
    let step_x = mask.width as f32 + mask.font_size * 3.0;
    let step_y = mask.height as f32 + mask.font_size * 2.5;
    for (x, y, pixel) in output.enumerate_pixels_mut() {
        let (dx, dy) = (
            x as f32 - width as f32 / 2.0,
            y as f32 - height as f32 / 2.0,
        );
        let rx = cos * dx + sin * dy;
        let ry = -sin * dx + cos * dy;
        let mx = (rx + step_x / 2.0).rem_euclid(step_x) - step_x / 2.0 + mask.width as f32 / 2.0;
        let my = (ry + step_y / 2.0).rem_euclid(step_y) - step_y / 2.0 + mask.height as f32 / 2.0;
        if mx < 0.0 || my < 0.0 || mx >= mask.width as f32 || my >= mask.height as f32 {
            continue;
        }
        let alpha =
            mask.pixels[my as usize * mask.width + mx as usize] as f32 / 255.0 * spec.0.opacity;
        if alpha == 0.0 {
            continue;
        }
        for (channel, color) in pixel.0.iter_mut().zip(spec.0.color) {
            *channel = (*channel as f32 * (1.0 - alpha) + color as f32 * alpha).round() as u8;
        }
    }
    Ok(WatermarkedImage(output))
}
