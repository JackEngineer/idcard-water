#[cfg(feature = "desktop")]
mod commands;
mod jobs;
mod model;
mod session;
pub use model::*;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use watermark_core::{OutputFormat, PreviewTarget, WatermarkDraft};

#[derive(Clone)]
pub struct Service {
    inner: Arc<Inner>,
}
struct Inner {
    worker: jobs::Worker,
    busy: AtomicBool,
}
struct BusyGuard<'a>(&'a AtomicBool);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl Default for Service {
    fn default() -> Self {
        Self::new()
    }
}
impl Service {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                worker: jobs::Worker::new(),
                busy: AtomicBool::new(false),
            }),
        }
    }
    pub fn is_busy(&self) -> bool {
        self.inner.busy.load(Ordering::Acquire)
    }
    fn exclusive<T>(&self, work: impl FnOnce() -> AppResult<T>) -> AppResult<T> {
        self.inner
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| AppError::busy())?;
        let _guard = BusyGuard(&self.inner.busy);
        work()
    }
    pub fn sessions(&self) -> Vec<SessionView> {
        self.inner
            .worker
            .call(None, |store| Ok(store.views()))
            .unwrap_or_default()
    }
    pub fn import_paths(&self, paths: Vec<PathBuf>) -> AppResult<Vec<SessionView>> {
        self.exclusive(|| {
            self.inner
                .worker
                .call(None, move |store| store.import(paths))
        })
    }
    pub fn remove_image(&self, id: &str) -> AppResult<Vec<SessionView>> {
        let id = id.to_string();
        self.exclusive(|| {
            self.inner.worker.call(None, move |store| {
                store.image(&id)?;
                store.sessions.retain(|item| item.view.id != id);
                Ok(store.views())
            })
        })
    }
    pub fn confirmation_preview(&self, id: &str) -> AppResult<Vec<u8>> {
        let id = id.to_string();
        self.inner
            .worker
            .call(None, move |store| store.confirmation(&id))
    }
    pub fn request_preview(
        &self,
        id: String,
        revision: u64,
        draft: Option<WatermarkDraft>,
        target: PreviewTarget,
    ) -> AppResult<Vec<u8>> {
        if self.is_busy() {
            return Err(AppError::busy());
        }
        self.inner
            .worker
            .call(Some((id.clone(), revision)), move |store| {
                store.preview(&id, draft, target)
            })
    }
    pub fn authorize_directory(&self, directory: PathBuf) -> AppResult<String> {
        self.exclusive(|| {
            self.inner
                .worker
                .call(None, move |store| store.authorize(directory))
        })
    }
    pub fn start_export(
        &self,
        ids: Vec<String>,
        draft: WatermarkDraft,
        format: OutputFormat,
        token: &str,
    ) -> AppResult<ExportReport> {
        let token = token.to_string();
        self.exclusive(|| {
            self.inner
                .worker
                .call(None, move |store| store.export(ids, draft, format, token))
        })
    }
    pub fn retry_export(&self, batch_id: String, token: String) -> AppResult<ExportReport> {
        self.exclusive(|| {
            self.inner
                .worker
                .call(None, move |store| store.retry(batch_id, token))
        })
    }
}
#[cfg(feature = "desktop")]
pub use commands::run;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exclusive_work_rejects_mutations_and_recovers_after_failure() {
        let service = Service::new();
        let held = service.clone();
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let job = std::thread::spawn(move || {
            held.exclusive(|| {
                started_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                Err::<(), _>(AppError::busy())
            })
        });
        started_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert_eq!(service.import_paths(vec![]).unwrap_err().code, "busy");
        assert_eq!(service.remove_image("anything").unwrap_err().code, "busy");
        assert_eq!(
            service
                .start_export(vec![], WatermarkDraft::default(), OutputFormat::Png, "")
                .unwrap_err()
                .code,
            "busy"
        );
        release_tx.send(()).unwrap();
        assert!(job.join().unwrap().is_err());
        assert!(service.import_paths(vec![]).unwrap().is_empty());
    }
}
