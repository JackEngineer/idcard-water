import { describe, expect, test } from 'vitest';
import { defaultWatermark, validateWatermark, receivePreview, insertLocalDate, type PreviewState } from './model';

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
