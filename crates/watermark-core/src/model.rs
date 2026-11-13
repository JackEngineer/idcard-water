use image::RgbImage;
use thiserror::Error;

pub const MAX_INPUT_BYTES: usize = 50 * 1024 * 1024;
pub const MAX_PIXELS: u64 = 64_000_000;

#[derive(Clone, Copy, Debug, Error, PartialEq, Eq)]
pub enum CoreError {
    #[error("仅支持静态 JPEG 和 PNG 图片，暂不支持 HEIC、PDF 或其他格式")]
    UnsupportedFormat,
    #[error("暂不支持动画或包含多张图像的文件")]
    AnimatedInput,
    #[error("图片文件不能超过 50 MiB")]
    InputTooLarge,
    #[error("图片不能超过 6400 万像素")]
    ImageTooLarge,
    #[error("图片已损坏或无法解码，请重新选择图片")]
    DecodeFailed,
    #[error("无法正确转换图片颜色，请先转换为标准 sRGB 图片")]
    ColorProfileFailed,
    #[error("请输入水印内容")]
    EmptyText,
    #[error("水印内容最多 200 个字符")]
    TextTooLong,
    #[error("水印内容最多输入 4 行")]
    TooManyLines,
    #[error("水印样式参数不在允许范围内")]
    InvalidStyle,
    #[error("字体无法显示某些字符，请修改水印内容")]
    MissingGlyph,
    #[error("完整水印无法放入图片，请缩短内容或调小字号")]
    LayoutDoesNotFit,
    #[error("预览区域无效，请重新适应窗口")]
    InvalidPreview,
    #[error("无法编码图片，请重试或更换输出格式")]
    EncodeFailed,
}

#[derive(Clone, Debug)]
pub struct WatermarkDraft {
    pub text: String,
    pub opacity: f32,
    pub angle_deg: f32,
    pub size_ratio: f32,
    pub color: [u8; 3],
}
impl Default for WatermarkDraft {
    fn default() -> Self {
        Self {
            text: String::new(),
            opacity: 0.24,
            angle_deg: -30.0,
            size_ratio: 0.035,
            color: [80; 3],
        }
    }
}
#[derive(Clone, Debug)]
pub struct WatermarkSpec(pub(crate) WatermarkDraft);
impl WatermarkSpec {
    pub fn text(&self) -> &str {
        &self.0.text
    }
}
impl TryFrom<WatermarkDraft> for WatermarkSpec {
    type Error = CoreError;
    fn try_from(mut draft: WatermarkDraft) -> Result<Self, Self::Error> {
        draft.text = draft.text.replace("\r\n", "\n").replace('\r', "\n");
        if draft.text.trim().is_empty() {
            return Err(CoreError::EmptyText);
        }
        if draft.text.chars().count() > 200 {
            return Err(CoreError::TextTooLong);
        }
        if draft.text.split('\n').count() > 4 {
            return Err(CoreError::TooManyLines);
        }
        if !draft.opacity.is_finite()
            || !draft.angle_deg.is_finite()
            || !draft.size_ratio.is_finite()
            || !(0.10..=0.60).contains(&draft.opacity)
            || !(-60.0..=60.0).contains(&draft.angle_deg)
            || !(0.01..=0.12).contains(&draft.size_ratio)
        {
            return Err(CoreError::InvalidStyle);
        }
        Ok(Self(draft))
    }
}

pub struct NormalizedImage(pub(crate) RgbImage);
impl NormalizedImage {
    pub fn dimensions(&self) -> (u32, u32) {
        self.0.dimensions()
    }
    pub fn pixels(&self) -> &[u8] {
        self.0.as_raw()
    }
}
pub struct WatermarkedImage(pub(crate) RgbImage);
impl WatermarkedImage {
    pub fn dimensions(&self) -> (u32, u32) {
        self.0.dimensions()
    }
    pub fn pixels(&self) -> &[u8] {
        self.0.as_raw()
    }
}
#[derive(Clone, Copy, Debug)]
pub enum OutputFormat {
    Jpeg,
    Png,
}
#[derive(Clone, Copy, Debug)]
pub enum PreviewTarget {
    Fit {
        max_edge: u32,
    },
    Detail {
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
}
