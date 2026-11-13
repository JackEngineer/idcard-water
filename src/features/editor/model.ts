export type WatermarkDraft = { text: string; opacity: number; angleDeg: number; sizeRatio: number; color: [number, number, number] };
export type PreviewState = { revision: number; status: 'idle' | 'loading' | 'ready' | 'failed'; url: string | null };
export type EditorPhase = 'empty' | 'importing' | 'editing' | 'exporting';
export function defaultWatermark(): WatermarkDraft { return { text: '', opacity: 0.24, angleDeg: -30, sizeRatio: 0.035, color: [80,80,80] }; }
export function validateWatermark(draft: WatermarkDraft): string | null {
  const text = draft.text.replace(/\r\n?/g, '\n');
  if (!text.trim()) return '请输入水印内容';
  if ([...text].length > 200) return '水印内容最多 200 个字符';
  if (text.split('\n').length > 4) return '水印内容最多输入 4 行';
  if (!Number.isFinite(draft.opacity) || !Number.isFinite(draft.angleDeg) || !Number.isFinite(draft.sizeRatio)
    || draft.opacity < 0.1 || draft.opacity > 0.6 || draft.angleDeg < -60 || draft.angleDeg > 60 || draft.sizeRatio < 0.01 || draft.sizeRatio > 0.12) return '水印样式参数不在允许范围内';
  return null;
}
export function receivePreview(state: PreviewState, revision: number, url: string): PreviewState {
  if (revision !== state.revision) return state;
  return { revision, status: 'ready', url };
}
export function insertLocalDate(text: string, date: Date): string {
  const stamp = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return text ? `${text}\n${stamp}` : stamp;
}
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message;
  return '操作未完成，请重试或重新选择图片';
}
