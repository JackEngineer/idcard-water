use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use std::io::Cursor;

pub fn rgb_png(width: u32, height: u32) -> Vec<u8> {
    let pixels = RgbImage::from_pixel(width, height, Rgb([240, 240, 240]));
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(pixels)
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    bytes.into_inner()
}
