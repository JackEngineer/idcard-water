import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import type { WatermarkDraft } from './model';
export type SessionView = { id: string; displayName: string; width: number; height: number };
export type OutputFormat = 'jpeg' | 'png';
export type PreviewTarget = {kind: 'fit'; maxEdge: number} | {kind: 'detail'; x: number; y: number; width: number; height: number};
export type ExportItem = {sessionId: string; status: 'success'; outputName: string} | {sessionId: string; status: 'failed'; errorCode: string; message: string};
export type ExportReport = {batchId: string; results: ExportItem[]};
export type ExportRequest = {sessionIds: string[]; watermark: WatermarkDraft; format: OutputFormat; directoryToken: string};
export interface NativeClient {
  available: boolean;
  getSessions(): Promise<SessionView[]>;
  chooseImages(): Promise<SessionView[]>;
  removeImage(sessionId: string): Promise<SessionView[]>;
  requestPreview(request: {sessionId: string; revision: number; watermark: WatermarkDraft | null; target: PreviewTarget}): Promise<Uint8Array>;
  chooseExportDirectory(): Promise<string | null>;
  startExport(request: ExportRequest): Promise<ExportReport>;
  retryExport(batchId: string, directoryToken: string): Promise<ExportReport>;
  subscribeImports(callback: (sessions: SessionView[] | null, error?: unknown) => void): Promise<() => void>;
}
export const nativeClient: NativeClient = {
  available: isTauri(),
  getSessions: () => invoke('get_sessions'),
  chooseImages: () => invoke('choose_images'),
  removeImage: (sessionId) => invoke('remove_image', {sessionId}),
  requestPreview: async (request) => new Uint8Array(await invoke<ArrayBuffer>('request_preview', request)),
  chooseExportDirectory: () => invoke('choose_export_directory'),
  startExport: (request) => invoke('start_export', request),
  retryExport: (batchId, directoryToken) => invoke('retry_export', {batchId, directoryToken}),
  subscribeImports: async (callback) => {
    const channel = new Channel<{sessions: SessionView[] | null; error: unknown}>();
    channel.onmessage = (payload) => callback(payload.sessions, payload.error);
    await invoke('subscribe_imports', {channel});
    return () => { void invoke('unsubscribe_imports', {channelId: channel.id}); };
  },
};
