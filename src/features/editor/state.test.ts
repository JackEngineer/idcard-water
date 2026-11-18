import { describe, expect, test } from 'vitest';
import type { ExportReport, SessionView } from './native';
import { initialState, reduce, type EditorEvent, type EditorState } from './state';

const front: SessionView = {id: 'front', displayName: 'front.png', width: 2400, height: 1600};
const back: SessionView = {id: 'back', displayName: 'back.png', width: 2400, height: 1600};
const report: ExportReport = {batchId: 'batch', results: [{sessionId: 'front', status: 'success', outputName: 'front_watermarked.jpg'}]};

const run = (events: EditorEvent[], from: EditorState = initialState) => events.reduce(reduce, from);
const editing = run([
  {type: 'images/replaced', images: [front, back]},
  {type: 'image/selected', sessionId: 'front'},
  {type: 'draft/edited', change: {text: '仅供测试使用'}},
]);

describe('images', () => {
  test('a late startup list cannot replace the list an import already returned', () => {
    const state = run([{type: 'images/replaced', images: [front]}, {type: 'startup/loaded', images: [front, back]}]);
    expect(state.images).toEqual([front]);
  });

  test('a newly added image becomes active, and removing the active one falls back to the first', () => {
    const added = run([{type: 'images/replaced', images: [front]}, {type: 'images/replaced', images: [front, back]}]);
    expect(added.activeId).toBe('back');
    const kept = reduce(added, {type: 'images/replaced', images: [front, back]});
    expect(kept.activeId).toBe('back');
    expect(reduce(added, {type: 'images/replaced', images: [front]}).activeId).toBe('front');
    expect(reduce(added, {type: 'images/replaced', images: []}).activeId).toBeNull();
  });

  test('choosing another image returns the preview to fit', () => {
    const detail = reduce(editing, {type: 'view/detail', center: null});
    expect(reduce(detail, {type: 'image/selected', sessionId: 'back'}).view).toEqual({kind: 'fit'});
  });
});

test('editing the draft, the format or the images clears the last report and notice', () => {
  const finished = run([{type: 'export/started', scope: 'current'}, {type: 'export/finished', report}], editing);
  const failed = run([{type: 'export/started', scope: 'current'}, {type: 'export/failed', message: '无法写入'}], editing);
  expect(finished.report).toEqual(report);
  expect(failed.notice).toEqual({site: 'export', tone: 'error', message: '无法写入'});
  const changes: EditorEvent[] = [
    {type: 'draft/edited', change: {text: '仅供另一用途'}},
    {type: 'draft/styleReset'},
    {type: 'format/chosen', format: 'png'},
    {type: 'images/replaced', images: [front]},
  ];
  for (const change of changes) {
    expect(reduce(finished, change).report).toBeNull();
    expect(reduce(failed, change).notice).toBeNull();
  }
});

test('while exporting, edits, selection, imports and view changes do nothing', () => {
  const exporting = reduce(editing, {type: 'export/started', scope: 'all'});
  const ignored: EditorEvent[] = [
    {type: 'draft/edited', change: {text: '改动'}},
    {type: 'draft/styleReset'},
    {type: 'format/chosen', format: 'png'},
    {type: 'image/selected', sessionId: 'back'},
    {type: 'images/replaced', images: [front]},
    {type: 'import/started'},
    {type: 'remove/started', sessionId: 'front'},
    {type: 'view/detail', center: null},
    {type: 'view/fit'},
    {type: 'export/started', scope: 'current'},
  ];
  for (const event of ignored) expect(reduce(exporting, event)).toBe(exporting);
});

describe('100% detail view', () => {
  test('is only available with an image and a valid watermark', () => {
    const blank = run([{type: 'images/replaced', images: [front]}]);
    expect(reduce(blank, {type: 'view/detail', center: null})).toBe(blank);
    expect(reduce(editing, {type: 'view/detail', center: null}).view).toEqual({kind: 'detail', center: {x: 1200, y: 800}});
  });

  test('moving stops at the image edge without producing a new state', () => {
    const detail = reduce(editing, {type: 'view/detail', center: {x: 2300, y: 100}});
    expect(detail.view).toEqual({kind: 'detail', center: {x: 1950, y: 300}});
    expect(reduce(detail, {type: 'view/moved', dx: 120, dy: -120})).toBe(detail);
    expect(reduce(detail, {type: 'view/moved', dx: -120, dy: 0}).view).toEqual({kind: 'detail', center: {x: 1830, y: 300}});
  });

  test('returns to fit once the watermark becomes invalid', () => {
    const detail = reduce(editing, {type: 'view/detail', center: null});
    expect(reduce(detail, {type: 'draft/edited', change: {text: '中'.repeat(201)}}).view).toEqual({kind: 'fit'});
  });
});

test('cancelling the folder dialog leaves an information notice at the export dock', () => {
  const cancelled = run([{type: 'export/started', scope: 'current'}, {type: 'export/cancelled'}], editing);
  expect(cancelled.activity).toEqual({kind: 'idle'});
  expect(cancelled.notice).toEqual({site: 'export', tone: 'info', message: '已取消选择保存位置，未导出图片。'});
});