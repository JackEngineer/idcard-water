use crate::{color, CoreError, NormalizedImage, MAX_INPUT_BYTES, MAX_PIXELS};
use image::{
    codecs::png::PngDecoder, DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits,
};
use std::io::Cursor;

pub fn decode(bytes: &[u8]) -> Result<NormalizedImage, CoreError> {
    if bytes.len() > MAX_INPUT_BYTES {
        return Err(CoreError::InputTooLarge);
    }
    let format = image::guess_format(bytes).map_err(|_| CoreError::UnsupportedFormat)?;
    if !matches!(format, ImageFormat::Jpeg | ImageFormat::Png) {
        return Err(CoreError::UnsupportedFormat);
    }
    if format == ImageFormat::Jpeg && has_mpf(bytes) {
        return Err(CoreError::AnimatedInput);
    }
    if format == ImageFormat::Png && bytes.len() >= 24 && &bytes[12..16] == b"IHDR" {
        let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap()) as u64;
        let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap()) as u64;
        if width
            .checked_mul(height)
            .is_none_or(|pixels| pixels > MAX_PIXELS)
        {
            return Err(CoreError::ImageTooLarge);
        }
    }
    let mut limits = Limits::default();
    limits.max_alloc = Some(512 * 1024 * 1024);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits.clone());
    let mut decoder = reader.into_decoder().map_err(|_| CoreError::DecodeFailed)?;
    let (w, h) = decoder.dimensions();
    if w == 0 || h == 0 {
        return Err(CoreError::DecodeFailed);
    }
    if (w as u64)
        .checked_mul(h as u64)
        .is_none_or(|pixels| pixels > MAX_PIXELS)
    {
        return Err(CoreError::ImageTooLarge);
    }
    if format == ImageFormat::Png {
        let png = PngDecoder::with_limits(Cursor::new(bytes), limits)
            .map_err(|_| CoreError::DecodeFailed)?;
        if png.is_apng().map_err(|_| CoreError::DecodeFailed)? {
            return Err(CoreError::AnimatedInput);
        }
    }
    let orientation = decoder.orientation().map_err(|_| CoreError::DecodeFailed)?;
    let icc = decoder
        .icc_profile()
        .map_err(|_| CoreError::ColorProfileFailed)?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|_| CoreError::DecodeFailed)?;
    image.apply_orientation(orientation);
    Ok(NormalizedImage(color::normalize(image, icc.as_deref())?))
}

fn has_mpf(bytes: &[u8]) -> bool {
    let mut offset = 2;
    while offset + 4 <= bytes.len() && bytes[offset] == 0xff {
        while offset < bytes.len() && bytes[offset] == 0xff {
            offset += 1;
        }
        if offset >= bytes.len() {
            break;
        }
        let marker = bytes[offset];
        offset += 1;
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        if offset + 2 > bytes.len() {
            break;
        }
        let size = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        if size < 2 || offset + size > bytes.len() {
            break;
        }
        if marker == 0xe2 && bytes[offset + 2..offset + size].starts_with(b"MPF\0") {
            return true;
        }
        offset += size;
    }
    false
}
