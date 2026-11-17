import { describe, expect, test } from 'vitest';
import {
  PURPOSE_TEMPLATE,
  cloneDraft,
  defaultWatermark,
  detailTarget,
  exportGate,
  firstPlaceholder,
  insertLocalDate,
  receivePreview,
  reportOutcome,
  styleSummary,
  validateWatermark,
  type GateInput,
  type PreviewState,
} from './model';

describe('watermark form contract', () => {
  test('empty content cannot be exported', () => {
    expect(validateWatermark(defaultWatermark())).toBe('请输入水印内容');
  });
  test('counts Unicode scalar values rather than UTF-16 units', () => {
    expect(validateWatermark({ ...defaultWatermark(), text: '中'.repeat(200) })).toBeNull();
    expect(validateWatermark({ ...defaultWatermark(), text: '中'.repeat(201) })).toContain('200');
    expect(validateWatermark({ ...defaultWatermark(), text: '𠮷'.repeat(200) })).toBeNull();
  });
  test('checks explicit line limits and style ranges', () => {
    expect(validateWatermark({ ...defaultWatermark(), text: '一\n二\n三\n四\n五' })).toContain('4');
    expect(validateWatermark({ ...defaultWatermark(), text: '测试', opacity: NaN })).not.toBeNull();
  });
  test('dates are inserted only at the explicit action', () => {
    expect(insertLocalDate('测试', new Date(2026, 10, 13))).toBe('测试\n2026-11-13');
  });
});

test('a late preview cannot overwrite a newer revision', () => {
  const current: PreviewState = { revision: 4, status: 'loading', url: null };
  expect(receivePreview(current, 3, 'blob:old')).toEqual(current);
  expect(receivePreview(current, 4, 'blob:new')).toEqual({ revision: 4, status: 'ready', url: 'blob:new' });
});

test('the export snapshot does not follow later edits to the draft colour', () => {
  const draft = defaultWatermark();
  const snapshot = cloneDraft(draft);
  draft.color[0] = 0;
  expect(snapshot.color).toEqual(defaultWatermark().color);
});

test('the first 【…】 placeholder is found so the template can select it', () => {
  expect(firstPlaceholder(PURPOSE_TEMPLATE)).toEqual([2, 7]);
  expect(PURPOSE_TEMPLATE.slice(2, 7)).toBe('【接收方】');
  expect(firstPlaceholder('仅供示例银行办理开户使用')).toBeNull();
});

test('the style summary reads as a sentence with a real minus sign', () => {
  expect(styleSummary(defaultWatermark())).toBe('透明度 24% · 角度 −30° · 字号 3.5%');
  expect(styleSummary({ ...defaultWatermark(), angleDeg: 15 })).toBe('透明度 24% · 角度 15° · 字号 3.5%');
});

describe('100% detail region', () => {
  const photo = { id: 'a', displayName: 'a.png', width: 2400, height: 1600 };
  test('is centred on the requested point', () => {
    expect(detailTarget(photo, { x: 1200, y: 800 })).toEqual({ kind: 'detail', x: 750, y: 500, width: 900, height: 600 });
  });
  test('stays inside the image near an edge', () => {
    expect(detailTarget(photo, { x: 10, y: 1590 })).toEqual({ kind: 'detail', x: 0, y: 1000, width: 900, height: 600 });
  });
  test('shrinks to the whole image when the image is smaller than the region', () => {
    expect(detailTarget({ ...photo, width: 600, height: 400 }, { x: 590, y: 5 })).toEqual({ kind: 'detail', x: 0, y: 0, width: 600, height: 400 });
  });
});

describe('export gate', () => {
  const open: GateInput = { available: true, hasImage: true, activity: 'idle', draft: 'valid', preview: 'ready', text: '仅供测试使用' };
  test('reports the first blocking reason in the order the user can fix them', () => {
    const steps: [Partial<GateInput>, string][] = [
      [{ available: false, hasImage: false, draft: 'blank' }, 'browser'],
      [{ hasImage: false, activity: 'exporting' }, 'no-image'],
      [{ activity: 'exporting', draft: 'blank' }, 'exporting'],
      [{ activity: 'importing', draft: 'blank' }, 'busy'],
      [{ draft: 'blank', preview: 'failed' }, 'blank'],
      [{ draft: 'invalid', preview: 'failed' }, 'invalid'],
      [{ preview: 'failed' }, 'preview-failed'],
      [{ preview: 'updating' }, 'preview-updating'],
    ];
    for (const [change, reason] of steps) {
      expect(exportGate({ ...open, ...change })).toEqual({ open: false, reason });
    }
  });
  test('opens with a caution when a placeholder is left in the text', () => {
    expect(exportGate(open)).toEqual({ open: true, warning: null });
    expect(exportGate({ ...open, text: PURPOSE_TEMPLATE })).toEqual({ open: true, warning: '水印里还有未填写的【…】，导出前请确认。' });
  });
});

test('an export report is a success, a partial result or a failure', () => {
  const ok = { sessionId: 'a', status: 'success' as const, outputName: 'a.jpg' };
  const bad = { sessionId: 'b', status: 'failed' as const, errorCode: 'write_failed', message: '无法写入' };
  expect(reportOutcome({ batchId: 'x', results: [ok] })).toBe('success');
  expect(reportOutcome({ batchId: 'x', results: [ok, bad] })).toBe('partial');
  expect(reportOutcome({ batchId: 'x', results: [bad] })).toBe('failed');
});