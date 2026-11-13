use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}
impl AppError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
    pub(crate) fn busy() -> Self {
        Self::new("busy", "正在处理图片，请稍候")
    }
    pub(crate) fn removed() -> Self {
        Self::new("image_removed", "图片已移除，请重新选择图片")
    }
}
impl From<watermark_core::CoreError> for AppError {
    fn from(value: watermark_core::CoreError) -> Self {
        Self::new("image_processing", value.to_string())
    }
}
pub type AppResult<T> = Result<T, AppError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub id: String,
    pub display_name: String,
    pub width: u32,
    pub height: u32,
}
#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ExportItem {
    Success {
        session_id: String,
        output_name: String,
    },
    Failed {
        session_id: String,
        error_code: &'static str,
        message: String,
    },
}
impl ExportItem {
    pub(crate) fn id(&self) -> &str {
        match self {
            Self::Success { session_id, .. } | Self::Failed { session_id, .. } => session_id,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub batch_id: String,
    pub results: Vec<ExportItem>,
}
