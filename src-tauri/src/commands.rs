use crate::{AppError, AppResult, ExportReport, Service, SessionView};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    ipc::{Channel, Response},
    Manager, State,
};
use tauri_plugin_dialog::DialogExt;
use watermark_core::{OutputFormat, PreviewTarget, WatermarkDraft};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DraftInput {
    text: String,
    opacity: f32,
    angle_deg: f32,
    size_ratio: f32,
    color: [u8; 3],
}
impl From<DraftInput> for WatermarkDraft {
    fn from(value: DraftInput) -> Self {
        Self {
            text: value.text,
            opacity: value.opacity,
            angle_deg: value.angle_deg,
            size_ratio: value.size_ratio,
            color: value.color,
        }
    }
}
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum TargetInput {
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
impl From<TargetInput> for PreviewTarget {
    fn from(value: TargetInput) -> Self {
        match value {
            TargetInput::Fit { max_edge } => Self::Fit { max_edge },
            TargetInput::Detail {
                x,
                y,
                width,
                height,
            } => Self::Detail {
                x,
                y,
                width,
                height,
            },
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum FormatInput {
    Jpeg,
    Png,
}
impl From<FormatInput> for OutputFormat {
    fn from(value: FormatInput) -> Self {
        match value {
            FormatInput::Jpeg => Self::Jpeg,
            FormatInput::Png => Self::Png,
        }
    }
}
#[derive(Clone, Serialize)]
struct ImportNotice {
    sessions: Option<Vec<SessionView>>,
    error: Option<AppError>,
}
#[derive(Default)]
struct Imports(Mutex<Option<Channel<ImportNotice>>>);

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| AppError::new("processing_failed", "处理未完成，请重试"))?
}
#[tauri::command]
async fn get_sessions(service: State<'_, Service>) -> AppResult<Vec<SessionView>> {
    let service = service.inner().clone();
    blocking(move || Ok(service.sessions())).await
}
#[tauri::command]
async fn choose_images(
    app: tauri::AppHandle,
    service: State<'_, Service>,
) -> AppResult<Vec<SessionView>> {
    let service = service.inner().clone();
    blocking(move || {
        if service.is_busy() {
            return Err(AppError::busy());
        }
        let Some(files) = app
            .dialog()
            .file()
            .add_filter("静态 JPEG / PNG", &["jpg", "jpeg", "png"])
            .blocking_pick_files()
        else {
            return Ok(service.sessions());
        };
        let paths = files
            .into_iter()
            .map(|file| {
                file.into_path()
                    .map_err(|_| AppError::new("invalid_file", "请选择本机图片文件"))
            })
            .collect::<AppResult<Vec<_>>>()?;
        service.import_paths(paths)
    })
    .await
}
#[tauri::command]
async fn remove_image(
    service: State<'_, Service>,
    session_id: String,
) -> AppResult<Vec<SessionView>> {
    let service = service.inner().clone();
    blocking(move || service.remove_image(&session_id)).await
}
#[tauri::command]
async fn request_preview(
    service: State<'_, Service>,
    session_id: String,
    revision: u64,
    watermark: Option<DraftInput>,
    target: TargetInput,
) -> AppResult<Response> {
    let service = service.inner().clone();
    blocking(move || {
        service
            .request_preview(
                session_id,
                revision,
                watermark.map(Into::into),
                target.into(),
            )
            .map(Response::new)
    })
    .await
}
#[tauri::command]
async fn choose_export_directory(
    app: tauri::AppHandle,
    service: State<'_, Service>,
) -> AppResult<Option<String>> {
    let service = service.inner().clone();
    blocking(move || {
        if service.is_busy() {
            return Err(AppError::busy());
        }
        let Some(folder) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let folder = folder
            .into_path()
            .map_err(|_| AppError::new("invalid_directory", "请选择本机文件夹"))?;
        service.authorize_directory(folder).map(Some)
    })
    .await
}
#[tauri::command]
async fn start_export(
    service: State<'_, Service>,
    session_ids: Vec<String>,
    watermark: DraftInput,
    format: FormatInput,
    directory_token: String,
) -> AppResult<ExportReport> {
    let service = service.inner().clone();
    blocking(move || {
        service.start_export(
            session_ids,
            watermark.into(),
            format.into(),
            &directory_token,
        )
    })
    .await
}
#[tauri::command]
async fn retry_export(
    service: State<'_, Service>,
    batch_id: String,
    directory_token: String,
) -> AppResult<ExportReport> {
    let service = service.inner().clone();
    blocking(move || service.retry_export(batch_id, directory_token)).await
}
#[tauri::command]
fn subscribe_imports(imports: State<'_, Imports>, channel: Channel<ImportNotice>) {
    *imports.0.lock().unwrap() = Some(channel);
}
#[tauri::command]
fn unsubscribe_imports(imports: State<'_, Imports>, channel_id: u32) {
    let mut current = imports.0.lock().unwrap();
    if current
        .as_ref()
        .is_some_and(|channel| channel.id() == channel_id)
    {
        *current = None;
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Service::new())
        .manage(Imports::default())
        .invoke_handler(tauri::generate_handler![
            get_sessions,
            choose_images,
            remove_image,
            request_preview,
            choose_export_directory,
            start_export,
            retry_export,
            subscribe_imports,
            unsubscribe_imports
        ])
        .setup(|app| {
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("证件水印")
                .inner_size(1180.0, 800.0)
                .min_inner_size(760.0, 600.0)
                .on_navigation(|url| {
                    if cfg!(debug_assertions) && url.as_str().starts_with("http://127.0.0.1:1420/")
                    {
                        return true;
                    }
                    url.scheme() == "tauri"
                        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                })
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let app = window.app_handle().clone();
                let service = app.state::<Service>().inner().clone();
                let paths = paths.clone();
                tauri::async_runtime::spawn(async move {
                    let result = blocking(move || service.import_paths(paths)).await;
                    let notice = match result {
                        Ok(sessions) => ImportNotice {
                            sessions: Some(sessions),
                            error: None,
                        },
                        Err(error) => ImportNotice {
                            sessions: None,
                            error: Some(error),
                        },
                    };
                    if let Some(channel) = app.state::<Imports>().0.lock().unwrap().as_ref() {
                        let _ = channel.send(notice);
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("desktop application could not start");
}
