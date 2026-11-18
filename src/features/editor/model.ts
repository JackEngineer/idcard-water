import type { ExportReport, PreviewTarget, SessionView } from './native';

export type WatermarkDraft = { text: string; opacity: number; angleDeg: number; sizeRatio: number; color: [number, number, number] };
export type PreviewState = { revision: number; status: 'idle' | 'loading' | 'ready' | 'failed'; url: string | null };
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

// structuredClone needs Safari 15.4 and the app supports macOS 11.
export function cloneDraft(draft: WatermarkDraft): WatermarkDraft {
  return {...draft, color: [draft.color[0], draft.color[1], draft.color[2]]};
}

export type DraftStatus = {kind: 'blank'} | {kind: 'invalid'; message: string} | {kind: 'valid'};

export function draftStatus(draft: WatermarkDraft): DraftStatus {
  if (!draft.text.trim()) return {kind: 'blank'};
  const message = validateWatermark(draft);
  return message ? {kind: 'invalid', message} : {kind: 'valid'};
}

export const PURPOSE_TEMPLATE = '仅供【接收方】办理【具体事项】使用';

export function firstPlaceholder(text: string): readonly [start: number, end: number] | null {
  const match = /【[^】]*】/.exec(text);
  return match ? [match.index, match.index + match[0].length] : null;
}

export function styleValues(draft: WatermarkDraft) {
  return {
    opacity: `${Math.round(draft.opacity * 100)}%`,
    angle: `${draft.angleDeg < 0 ? '−' : ''}${Math.abs(draft.angleDeg)}°`,
    size: `${(draft.sizeRatio * 100).toFixed(1)}%`,
  };
}

export function styleSummary(draft: WatermarkDraft): string {
  const values = styleValues(draft);
  return `透明度 ${values.opacity} · 角度 ${values.angle} · 字号 ${values.size}`;
}

export type Point = {x: number; y: number};
export type DetailTarget = Extract<PreviewTarget, {kind: 'detail'}>;

export const FIT_TARGET: PreviewTarget = {kind: 'fit', maxEdge: 1600};
export const DETAIL_STEP = 120;
const DETAIL_SIZE = {width: 900, height: 600};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function imageCenter(image: SessionView): Point {
  return {x: image.width / 2, y: image.height / 2};
}

export function detailTarget(image: SessionView, center: Point): DetailTarget {
  const width = Math.min(image.width, DETAIL_SIZE.width);
  const height = Math.min(image.height, DETAIL_SIZE.height);
  return {
    kind: 'detail',
    x: clamp(Math.round(center.x - width / 2), 0, image.width - width),
    y: clamp(Math.round(center.y - height / 2), 0, image.height - height),
    width,
    height,
  };
}

export function clampCenter(image: SessionView, center: Point): Point {
  const target = detailTarget(image, center);
  return {x: target.x + target.width / 2, y: target.y + target.height / 2};
}

export function pointInImage(image: SessionView, rendered: {left: number; top: number; width: number; height: number}, client: Point): Point {
  return {
    x: (client.x - rendered.left) / rendered.width * image.width,
    y: (client.y - rendered.top) / rendered.height * image.height,
  };
}

export type BlockReason = 'browser' | 'no-image' | 'exporting' | 'busy' | 'blank' | 'invalid' | 'preview-failed' | 'preview-updating';

export type ExportGate = {open: true; warning: string | null} | {open: false; reason: BlockReason};

export type GateInput = {
  available: boolean;
  hasImage: boolean;
  activity: 'idle' | 'importing' | 'removing' | 'exporting';
  draft: DraftStatus['kind'];
  preview: 'none' | 'paused' | 'updating' | 'ready' | 'failed';
  text: string;
};

// The first failing check is the one the user can act on now.
export function exportGate(input: GateInput): ExportGate {
  const closed = (reason: BlockReason): ExportGate => ({open: false, reason});
  if (!input.available) return closed('browser');
  if (!input.hasImage) return closed('no-image');
  if (input.activity === 'exporting') return closed('exporting');
  if (input.activity !== 'idle') return closed('busy');
  if (input.draft === 'blank') return closed('blank');
  if (input.draft === 'invalid') return closed('invalid');
  if (input.preview === 'failed') return closed('preview-failed');
  if (input.preview !== 'ready') return closed('preview-updating');
  return {open: true, warning: firstPlaceholder(input.text) ? '水印里还有未填写的【…】，导出前请确认。' : null};
}

// Worded apart from the stage and textarea messages so each one is on screen once.
export function blockCopy(reason: BlockReason): string {
  switch (reason) {
    case 'browser': return '请在桌面应用中导入和导出';
    case 'no-image': return '先选择需要加水印的图片';
    case 'exporting': return '正在另存…';
    case 'busy': return '请等待当前操作完成';
    case 'blank': return '填写水印内容后即可导出';
    case 'invalid': return '水印内容需要修改，见上方提示';
    case 'preview-failed': return '预览未生成，暂不能导出';
    case 'preview-updating': return '正在生成预览…';
    default: {
      const unhandled: never = reason;
      return unhandled;
    }
  }
}

export type ReportOutcome = 'success' | 'partial' | 'failed';

export function reportOutcome(report: ExportReport): ReportOutcome {
  if (report.results.every(item => item.status === 'success')) return 'success';
  return report.results.some(item => item.status === 'success') ? 'partial' : 'failed';
}

export function reportTitle(outcome: ReportOutcome): string {
  switch (outcome) {
    case 'success': return '导出完成';
    case 'partial': return '部分图片未能导出';
    case 'failed': return '导出未完成';
    default: {
      const unhandled: never = outcome;
      return unhandled;
    }
  }
}