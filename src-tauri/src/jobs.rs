use crate::{session::Store, AppError, AppResult};
use std::{
    collections::VecDeque,
    sync::{mpsc, Arc, Condvar, Mutex},
    thread,
};

type Work = Box<dyn FnOnce(&mut Store) + Send>;
struct Job {
    preview: Option<(String, u64)>,
    work: Work,
}
#[derive(Default)]
struct Queue {
    jobs: VecDeque<Job>,
    closed: bool,
}
#[derive(Default)]
struct Shared {
    queue: Mutex<Queue>,
    ready: Condvar,
}
pub(crate) struct Worker {
    shared: Arc<Shared>,
}
impl Worker {
    pub fn new() -> Self {
        let shared = Arc::new(Shared::default());
        let receiver = shared.clone();
        thread::Builder::new()
            .name("image-worker".into())
            .spawn(move || {
                let mut store = Store::default();
                loop {
                    let job = {
                        let mut queue = receiver.queue.lock().unwrap();
                        while queue.jobs.is_empty() && !queue.closed {
                            queue = receiver.ready.wait(queue).unwrap();
                        }
                        if queue.closed {
                            return;
                        }
                        queue.jobs.pop_front().unwrap()
                    };
                    (job.work)(&mut store);
                }
            })
            .expect("image worker could not start");
        Self { shared }
    }
    pub fn call<T: Send + 'static>(
        &self,
        preview: Option<(String, u64)>,
        work: impl FnOnce(&mut Store) -> AppResult<T> + Send + 'static,
    ) -> AppResult<T> {
        let (tx, rx) = mpsc::sync_channel(1);
        {
            let mut queue = self.shared.queue.lock().unwrap();
            if queue.closed {
                return Err(AppError::busy());
            }
            if let Some((id, revision)) = &preview {
                if queue.jobs.iter().any(|job| {
                    job.preview.as_ref().is_some_and(|(old_id, old_revision)| {
                        old_id == id && old_revision > revision
                    })
                }) {
                    return Err(AppError::new("superseded", "预览已更新"));
                }
                queue
                    .jobs
                    .retain(|job| !job.preview.as_ref().is_some_and(|(old_id, _)| old_id == id));
            }
            if queue.jobs.len() >= 16 {
                return Err(AppError::busy());
            }
            queue.jobs.push_back(Job {
                preview,
                work: Box::new(move |store| {
                    let result =
                        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(store)))
                            .unwrap_or_else(|_| {
                                Err(AppError::new(
                                    "processing_failed",
                                    "处理未完成，请移除图片后重试",
                                ))
                            });
                    let _ = tx.send(result);
                }),
            });
        }
        self.shared.ready.notify_one();
        rx.recv()
            .unwrap_or_else(|_| Err(AppError::new("superseded", "预览已更新")))
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        let mut queue = self.shared.queue.lock().unwrap();
        queue.closed = true;
        queue.jobs.clear();
        self.shared.ready.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn pending_previews_coalesce_and_older_revisions_cannot_replace_newer_ones() {
        let worker = Arc::new(Worker::new());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let blocking = worker.clone();
        let blocker = thread::spawn(move || {
            blocking.call(None, move |_| {
                started_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                Ok(())
            })
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let old_worker = worker.clone();
        let old = thread::spawn(move || old_worker.call(Some(("session".into(), 1)), |_| Ok(1)));
        {
            let mut queue = worker.shared.queue.lock().unwrap();
            while queue.jobs.is_empty() {
                let (next, timeout) = worker
                    .shared
                    .ready
                    .wait_timeout(queue, Duration::from_secs(5))
                    .unwrap();
                queue = next;
                assert!(!timeout.timed_out());
            }
        }
        let new_worker = worker.clone();
        let new = thread::spawn(move || new_worker.call(Some(("session".into(), 2)), |_| Ok(2)));
        assert_eq!(old.join().unwrap().unwrap_err().code, "superseded");
        assert_eq!(
            worker
                .call(Some(("session".into(), 0)), |_| Ok(0))
                .unwrap_err()
                .code,
            "superseded"
        );
        release_tx.send(()).unwrap();
        blocker.join().unwrap().unwrap();
        assert_eq!(new.join().unwrap().unwrap(), 2);
    }
    #[test]
    fn a_failed_job_returns_a_safe_error_and_worker_can_continue() {
        let worker = Worker::new();
        let failed: AppResult<()> = worker.call(None, |_| panic!("synthetic worker failure"));
        assert_eq!(failed.unwrap_err().code, "processing_failed");
        assert_eq!(worker.call(None, |_| Ok(42)).unwrap(), 42);
    }
}
