import { useEffect, useRef, useState } from 'react';
import type { NativeClient } from './native';
import { errorMessage } from './model';
import type { PreviewRequest, PreviewSpec } from './state';

export type PreviewView =
  | {status: 'none'}
  | {status: 'paused'}
  | {status: 'updating'}
  | {status: 'ready'; url: string; marked: boolean}
  | {status: 'failed'; message: string};

type Result =
  | {key: string; status: 'ready'; url: string; marked: boolean}
  | {key: string; status: 'failed'; message: string};

const DEBOUNCE_MS = 180;

// Every view is about the spec of this render: a result for any other key
// reads as `updating`, so a superseded preview is never shown as current.
export function usePreview(native: NativeClient, spec: PreviewSpec | null): PreviewView {
  const key = spec?.request ? JSON.stringify([spec.sessionId, spec.request]) : null;
  const [result, setResult] = useState<Result | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    if (!key || !native.available) return;
    const [sessionId, request] = JSON.parse(key) as [string, PreviewRequest];
    const current = ++revision.current;
    let cancelled = false;
    const timeout = setTimeout(() => {
      void native.requestPreview({sessionId, revision: current, ...request}).then(bytes => {
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], {type: 'image/png'}));
        setResult({key, status: 'ready', url, marked: request.watermark !== null});
      }, (error: unknown) => {
        if (!cancelled) setResult({key, status: 'failed', message: errorMessage(error)});
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [native, key]);

  const url = result?.status === 'ready' ? result.url : null;
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (!spec) return {status: 'none'};
  if (!spec.request) return {status: 'paused'};
  if (!result || result.key !== key) return {status: 'updating'};
  return result.status === 'ready'
    ? {status: 'ready', url: result.url, marked: result.marked}
    : {status: 'failed', message: result.message};
}