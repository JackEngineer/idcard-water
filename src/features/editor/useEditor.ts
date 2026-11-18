import { useEffect, useReducer, useRef } from 'react';
import type { ExportReport, NativeClient, OutputFormat } from './native';
import type { Point, WatermarkDraft } from './model';
import { cloneDraft, draftStatus, errorMessage, exportGate, insertLocalDate } from './model';
import type { ExportScope } from './state';
import { activeImage, detailAvailable, initialState, previewSpec, reduce } from './state';
import { usePreview } from './usePreview';

export type EditorController = ReturnType<typeof useEditor>;

export function useEditor(native: NativeClient) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!native.available) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void native.getSessions().then(
      images => {if (!disposed) dispatch({type: 'startup/loaded', images});},
      (error: unknown) => {if (!disposed) dispatch({type: 'startup/failed', message: errorMessage(error)});},
    );
    void native.subscribeImports((images, error) => {
      if (disposed) return;
      if (error) dispatch({type: 'images/failed', message: errorMessage(error)});
      if (images) dispatch({type: 'images/replaced', images});
    }).then(
      stop => {if (disposed) stop(); else unsubscribe = stop;},
      (error: unknown) => {if (!disposed) dispatch({type: 'images/failed', message: errorMessage(error)});},
    );
    return () => {disposed = true; unsubscribe?.();};
  }, [native]);

  const active = activeImage(state);
  const draft = draftStatus(state.draft);
  const preview = usePreview(native, previewSpec(state));
  const busy = state.activity.kind !== 'idle';
  const gate = exportGate({
    available: native.available,
    hasImage: active !== null,
    activity: state.activity.kind,
    draft: draft.kind,
    preview: preview.status,
    text: state.draft.text,
  });

  // The ref closes the gap between two clicks in one frame, before `busy` re-renders.
  async function exclusive(task: () => Promise<void>) {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    try {await task();} finally {inFlight.current = false;}
  }

  function importImages() {
    void exclusive(async () => {
      dispatch({type: 'import/started'});
      try {dispatch({type: 'images/replaced', images: await native.chooseImages()});}
      catch (error) {dispatch({type: 'images/failed', message: errorMessage(error)});}
    });
  }

  function removeImage(sessionId: string) {
    void exclusive(async () => {
      dispatch({type: 'remove/started', sessionId});
      try {dispatch({type: 'images/replaced', images: await native.removeImage(sessionId)});}
      catch (error) {dispatch({type: 'images/failed', message: errorMessage(error)});}
    });
  }

  function saveTo(scope: ExportScope, write: (directoryToken: string) => Promise<ExportReport>) {
    void exclusive(async () => {
      dispatch({type: 'export/started', scope});
      try {
        const directoryToken = await native.chooseExportDirectory();
        dispatch(directoryToken ? {type: 'export/finished', report: await write(directoryToken)} : {type: 'export/cancelled'});
      } catch (error) {
        dispatch({type: 'export/failed', message: errorMessage(error)});
      }
    });
  }

  function exportImages(scope: 'current' | 'all') {
    if (!gate.open || !active) return;
    const request = {
      sessionIds: scope === 'all' ? state.images.map(image => image.id) : [active.id],
      watermark: cloneDraft(state.draft),
      format: state.format,
    };
    saveTo(scope, directoryToken => native.startExport({...request, directoryToken}));
  }

  function retryFailed() {
    const report = state.report;
    if (report) saveTo('retry', directoryToken => native.retryExport(report.batchId, directoryToken));
  }

  return {
    available: native.available,
    images: state.images,
    active,
    activity: state.activity,
    busy,
    draft: state.draft,
    draftStatus: draft,
    format: state.format,
    view: state.view,
    detailAvailable: detailAvailable(state),
    preview,
    gate,
    notice: state.notice,
    report: state.report,
    importImages,
    removeImage,
    exportImages,
    retryFailed,
    selectImage: (sessionId: string) => dispatch({type: 'image/selected', sessionId}),
    editDraft: (change: Partial<WatermarkDraft>) => dispatch({type: 'draft/edited', change}),
    insertDate: () => dispatch({type: 'draft/edited', change: {text: insertLocalDate(state.draft.text, new Date())}}),
    resetStyle: () => dispatch({type: 'draft/styleReset'}),
    chooseFormat: (format: OutputFormat) => dispatch({type: 'format/chosen', format}),
    showFit: () => dispatch({type: 'view/fit'}),
    showDetail: (center: Point | null) => dispatch({type: 'view/detail', center}),
    moveDetail: (dx: number, dy: number) => dispatch({type: 'view/moved', dx, dy}),
  };
}