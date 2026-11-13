use crate::{AppError, AppResult, ExportItem, ExportReport, SessionView};
use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;
use watermark_core::{
    decode, encode, render, OutputFormat, WatermarkDraft, WatermarkFont, WatermarkSpec,
    MAX_INPUT_BYTES,
};

pub(crate) struct Session {
    pub view: SessionView,
    bytes: Vec<u8>,
}
pub(crate) struct Batch {
    pub draft: WatermarkDraft,
    pub format: OutputFormat,
    pub report: ExportReport,
}
#[derive(Default)]
pub(crate) struct Store {
    pub sessions: Vec<Session>,
    pub directory: Option<(String, PathBuf)>,
    pub batch: Option<Batch>,
}
impl Store {
    pub fn views(&self) -> Vec<SessionView> {
        self.sessions.iter().map(|item| item.view.clone()).collect()
    }
    pub fn import(&mut self, paths: Vec<PathBuf>) -> AppResult<Vec<SessionView>> {
        if paths.is_empty() {
            return Ok(self.views());
        }
        if paths.len() + self.sessions.len() > 2 {
            return Err(AppError::new(
                "too_many_images",
                "最多同时处理两张图片，请先移除不需要的图片",
            ));
        }
        let mut imported = Vec::new();
        for path in paths {
            let file = File::open(&path)
                .map_err(|_| AppError::new("read_failed", "无法读取图片，请检查文件权限后重试"))?;
            if !file
                .metadata()
                .map_err(|_| AppError::new("read_failed", "无法读取图片"))?
                .is_file()
            {
                return Err(AppError::new("not_a_file", "请选择图片文件，而不是文件夹"));
            }
            let mut bytes = Vec::new();
            file.take(MAX_INPUT_BYTES as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| AppError::new("read_failed", "无法读取图片，请重新选择"))?;
            let normalized = decode(&bytes)?;
            let (width, height) = normalized.dimensions();
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("image")
                .to_string();
            imported.push(Session {
                view: SessionView {
                    id: Uuid::new_v4().to_string(),
                    display_name: name,
                    width,
                    height,
                },
                bytes,
            });
        }
        self.sessions.extend(imported);
        Ok(self.views())
    }
    pub fn image(&self, id: &str) -> AppResult<&Session> {
        self.sessions
            .iter()
            .find(|item| item.view.id == id)
            .ok_or_else(AppError::removed)
    }
    pub fn confirmation(&self, id: &str) -> AppResult<Vec<u8>> {
        Ok(watermark_core::confirmation_preview(&decode(
            &self.image(id)?.bytes,
        )?)?)
    }
    pub fn preview(
        &self,
        id: &str,
        draft: Option<WatermarkDraft>,
        target: watermark_core::PreviewTarget,
    ) -> AppResult<Vec<u8>> {
        let image = decode(&self.image(id)?.bytes)?;
        match draft {
            Some(draft) => {
                let marked = render(
                    &image,
                    &WatermarkSpec::try_from(draft)?,
                    &WatermarkFont::bundled()?,
                )?;
                Ok(watermark_core::preview(&marked, target)?)
            }
            None if matches!(target, watermark_core::PreviewTarget::Fit { .. }) => {
                Ok(watermark_core::confirmation_preview(&image)?)
            }
            None => Err(AppError::new(
                "watermark_required",
                "请先输入水印，再检查原尺寸细节",
            )),
        }
    }
    pub fn authorize(&mut self, directory: PathBuf) -> AppResult<String> {
        let path = directory
            .canonicalize()
            .map_err(|_| AppError::new("invalid_directory", "导出文件夹已不可用，请重新选择"))?;
        if !path.is_dir() {
            return Err(AppError::new("invalid_directory", "请选择导出文件夹"));
        }
        let token = Uuid::new_v4().to_string();
        self.directory = Some((token.clone(), path));
        Ok(token)
    }
    pub fn export(
        &mut self,
        ids: Vec<String>,
        draft: WatermarkDraft,
        format: OutputFormat,
        token: String,
    ) -> AppResult<ExportReport> {
        WatermarkSpec::try_from(draft.clone())?;
        if ids.is_empty() || ids.len() > 2 || (ids.len() == 2 && ids[0] == ids[1]) {
            return Err(AppError::new(
                "invalid_selection",
                "请选择一张或两张不同的图片",
            ));
        }
        for id in &ids {
            self.image(id)?;
        }
        let directory = self.directory_path(&token)?;
        let results = ids
            .iter()
            .map(|id| self.export_one(id, &draft, format, &directory))
            .collect();
        let report = ExportReport {
            batch_id: Uuid::new_v4().to_string(),
            results,
        };
        self.batch = Some(Batch {
            draft,
            format,
            report: report.clone(),
        });
        Ok(report)
    }
    pub fn retry(&mut self, batch_id: String, token: String) -> AppResult<ExportReport> {
        let directory = self.directory_path(&token)?;
        let batch = self
            .batch
            .as_ref()
            .filter(|batch| batch.report.batch_id == batch_id)
            .ok_or_else(|| AppError::new("batch_expired", "导出批次已失效，请重新导出"))?;
        let draft = batch.draft.clone();
        let format = batch.format;
        let mut report = batch.report.clone();
        for result in &mut report.results {
            if matches!(result, ExportItem::Failed { .. }) {
                *result = self.export_one(result.id(), &draft, format, &directory);
            }
        }
        self.batch.as_mut().unwrap().report = report.clone();
        Ok(report)
    }
    fn directory_path(&self, token: &str) -> AppResult<PathBuf> {
        self.directory
            .as_ref()
            .filter(|(id, _)| id == token)
            .map(|(_, path)| path.clone())
            .ok_or_else(|| AppError::new("invalid_directory", "请重新选择导出文件夹"))
    }
    fn export_one(
        &self,
        id: &str,
        draft: &WatermarkDraft,
        format: OutputFormat,
        directory: &Path,
    ) -> ExportItem {
        let result = (|| {
            let session = self.image(id)?;
            let image = decode(&session.bytes)?;
            let marked = render(
                &image,
                &WatermarkSpec::try_from(draft.clone())?,
                &WatermarkFont::bundled()?,
            )?;
            let bytes = encode(&marked, format)?;
            write_unique(directory, &session.view.display_name, format, &bytes)
        })();
        match result {
            Ok(output_name) => ExportItem::Success {
                session_id: id.into(),
                output_name,
            },
            Err(error) => ExportItem::Failed {
                session_id: id.into(),
                error_code: error.code,
                message: error.message,
            },
        }
    }
}

fn write_unique(
    directory: &Path,
    original: &str,
    format: OutputFormat,
    bytes: &[u8],
) -> AppResult<String> {
    let stem: String = Path::new(original)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .chars()
        .take(80)
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let ext = match format {
        OutputFormat::Jpeg => "jpg",
        OutputFormat::Png => "png",
    };
    let write_error = || {
        AppError::new(
            "write_failed",
            "无法写入导出文件夹，请检查剩余空间和写入权限，或选择其他文件夹",
        )
    };
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|_| write_error())?;
    temp.write_all(bytes).map_err(|_| write_error())?;
    temp.as_file().sync_all().map_err(|_| write_error())?;
    for suffix in 0..10_000 {
        let name = if suffix == 0 {
            format!("{stem}_watermarked.{ext}")
        } else {
            format!("{stem}_watermarked_{suffix}.{ext}")
        };
        match temp.persist_noclobber(directory.join(&name)) {
            Ok(_) => return Ok(name),
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                temp = error.file
            }
            Err(_) => return Err(write_error()),
        }
    }
    Err(AppError::new(
        "name_conflict",
        "同名导出文件过多，请选择其他文件夹",
    ))
}
