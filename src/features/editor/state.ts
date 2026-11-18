import type { ExportReport, OutputFormat, PreviewTarget, SessionView } from './native';
import type { Point, WatermarkDraft } from './model';
import { FIT_TARGET, clampCenter, defaultWatermark, detailTarget, draftStatus, imageCenter } from './model';

export type ExportScope = 'current' | 'all' | 'retry';

export type Activity =
  | {kind: 'idle'}
  | {kind: 'importing'}
  | {kind: 'removing'; sessionId: string}
  | {kind: 'exporting'; scope: ExportScope};

export type View = {kind: 'fit'} | {kind: 'detail'; center: Point};

export type Notice = {site: 'images' | 'export'; tone: 'error' | 'info'; message: string};

export type EditorState = {
  images: readonly SessionView[];
  sessionsKnown: boolean;
  activeId: string | null;
  draft: WatermarkDraft;
  format: OutputFormat;
  view: View;
  activity: Activity;
  notice: Notice | null;
  report: ExportReport | null;
};

export type EditorEvent =
  | {type: 'startup/loaded'; images: SessionView[]}
  | {type: 'startup/failed'; message: string}
  | {type: 'import/started'}
  | {type: 'remove/started'; sessionId: string}
  | {type: 'images/replaced'; images: SessionView[]}
  | {type: 'images/failed'; message: string}
  | {type: 'image/selected'; sessionId: string}
  | {type: 'draft/edited'; change: Partial<WatermarkDraft>}
  | {type: 'draft/styleReset'}
  | {type: 'format/chosen'; format: OutputFormat}
  | {type: 'view/fit'}
  | {type: 'view/detail'; center: Point | null}
  | {type: 'view/moved'; dx: number; dy: number}
  | {type: 'export/started'; scope: ExportScope}
  | {type: 'export/cancelled'}
  | {type: 'export/finished'; report: ExportReport}
  | {type: 'export/failed'; message: string};

const IDLE: Activity = {kind: 'idle'};
const FIT: View = {kind: 'fit'};

export const initialState: EditorState = {
  images: [],
  sessionsKnown: false,
  activeId: null,
  draft: defaultWatermark(),
  format: 'jpeg',
  view: FIT,
  activity: IDLE,
  notice: null,
  report: null,
};

export function activeImage(state: EditorState): SessionView | null {
  return state.images.find(image => image.id === state.activeId) ?? null;
}

export function detailAvailable(state: EditorState): boolean {
  return activeImage(state) !== null && draftStatus(state.draft).kind === 'valid';
}

function pickActive(previous: readonly SessionView[], next: readonly SessionView[], activeId: string | null): string | null {
  const added = next.find(image => !previous.some(old => old.id === image.id));
  if (added) return added.id;
  return next.some(image => image.id === activeId) ? activeId : next[0]?.id ?? null;
}

function withDraft(state: EditorState, draft: WatermarkDraft): EditorState {
  return {...state, draft, view: draftStatus(draft).kind === 'valid' ? state.view : FIT, report: null, notice: null};
}

// While exporting, the batch on disk must be the one the user clicked, so every
// edit, selection, import and remove is a no-op here and not only a disabled control.
export function reduce(state: EditorState, event: EditorEvent): EditorState {
  const exporting = state.activity.kind === 'exporting';
  const idle = state.activity.kind === 'idle';
  switch (event.type) {
    case 'startup/loaded':
      if (state.sessionsKnown) return state;
      return {...state, images: event.images, sessionsKnown: true, activeId: event.images[0]?.id ?? null};
    case 'startup/failed':
      return {...state, notice: {site: 'images', tone: 'error', message: event.message}};
    case 'import/started':
      return idle ? {...state, activity: {kind: 'importing'}, notice: null} : state;
    case 'remove/started':
      return idle ? {...state, activity: {kind: 'removing', sessionId: event.sessionId}, notice: null} : state;
    case 'images/replaced':
      if (exporting) return state;
      return {
        ...state,
        images: event.images,
        sessionsKnown: true,
        activeId: pickActive(state.images, event.images, state.activeId),
        view: FIT,
        activity: IDLE,
        notice: null,
        report: null,
      };
    case 'images/failed':
      return {...state, activity: exporting ? state.activity : IDLE, notice: {site: 'images', tone: 'error', message: event.message}};
    case 'image/selected':
      if (exporting || !state.images.some(image => image.id === event.sessionId)) return state;
      return {...state, activeId: event.sessionId, view: FIT};
    case 'draft/edited':
      return exporting ? state : withDraft(state, {...state.draft, ...event.change});
    case 'draft/styleReset':
      return exporting ? state : withDraft(state, {...defaultWatermark(), text: state.draft.text});
    case 'format/chosen':
      return exporting ? state : {...state, format: event.format, report: null, notice: null};
    case 'view/fit':
      return exporting ? state : {...state, view: FIT};
    case 'view/detail': {
      const image = activeImage(state);
      if (exporting || !image || !detailAvailable(state)) return state;
      return {...state, view: {kind: 'detail', center: clampCenter(image, event.center ?? imageCenter(image))}};
    }
    case 'view/moved': {
      const image = activeImage(state);
      if (exporting || !image || state.view.kind !== 'detail') return state;
      const {center} = state.view;
      const moved = clampCenter(image, {x: center.x + event.dx, y: center.y + event.dy});
      if (moved.x === center.x && moved.y === center.y) return state;
      return {...state, view: {kind: 'detail', center: moved}};
    }
    case 'export/started':
      return idle ? {...state, activity: {kind: 'exporting', scope: event.scope}, notice: null} : state;
    case 'export/cancelled':
      if (!exporting) return state;
      return {...state, activity: IDLE, notice: {site: 'export', tone: 'info', message: '已取消选择保存位置，未导出图片。'}};
    case 'export/finished':
      return exporting ? {...state, activity: IDLE, report: event.report} : state;
    case 'export/failed':
      if (!exporting) return state;
      return {...state, activity: IDLE, notice: {site: 'export', tone: 'error', message: event.message}};
    default: {
      const unhandled: never = event;
      throw new Error(`unknown editor event ${JSON.stringify(unhandled)}`);
    }
  }
}

export type PreviewRequest = {watermark: WatermarkDraft | null; target: PreviewTarget};
export type PreviewSpec = {sessionId: string; request: PreviewRequest | null};

export function previewSpec(state: EditorState): PreviewSpec | null {
  const image = activeImage(state);
  if (!image) return null;
  const status = draftStatus(state.draft);
  switch (status.kind) {
    case 'blank':
      return {sessionId: image.id, request: {watermark: null, target: FIT_TARGET}};
    case 'invalid':
      return {sessionId: image.id, request: null};
    case 'valid':
      return {
        sessionId: image.id,
        request: {watermark: state.draft, target: state.view.kind === 'detail' ? detailTarget(image, state.view.center) : FIT_TARGET},
      };
    default: {
      const unhandled: never = status;
      throw new Error(`unknown draft status ${JSON.stringify(unhandled)}`);
    }
  }
}