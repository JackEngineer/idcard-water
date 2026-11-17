import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { Editor } from './Editor';
import type { NativeClient, SessionView } from './native';

const front: SessionView = {id: 'front', displayName: '合成正面.png', width: 2400, height: 1600};
const back: SessionView = {id: 'back', displayName: '合成反面.png', width: 2400, height: 1600};
const TEMPLATE = '仅供【接收方】办理【具体事项】使用';

function client(overrides: Partial<NativeClient> = {}): NativeClient {
  return {
    available: true,
    getSessions: async () => [],
    chooseImages: vi.fn(async () => [front]),
    removeImage: vi.fn(async () => []),
    requestPreview: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
    chooseExportDirectory: vi.fn(async () => 'directory-token'),
    startExport: vi.fn(async () => ({batchId: 'batch', results: [{sessionId: front.id, status: 'success' as const, outputName: 'front_watermarked.jpg'}]})),
    retryExport: vi.fn(async () => ({batchId: 'batch', results: []})),
    subscribeImports: async () => () => {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('URL', {createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn()});
});

const exportButton = () => screen.getByRole('button', {name: '导出当前图片'});
const workspace = () => screen.getByRole('region', {name: '图片工作区'});
const inspector = () => screen.getByRole('complementary', {name: '水印与导出设置'});
const writeWatermark = (value: string) => fireEvent.change(screen.getByLabelText('水印内容'), {target: {value}});
const lastTarget = (native: NativeClient) => vi.mocked(native.requestPreview).mock.lastCall?.[0].target;

async function openWithFront(native: NativeClient) {
  render(<Editor native={native}/>);
  await userEvent.click(screen.getByRole('button', {name: '选择图片'}));
  await screen.findByText(front.displayName);
}

async function readyToExport(native: NativeClient, text = '仅供测试使用') {
  await openWithFront(native);
  writeWatermark(text);
  await waitFor(() => expect(exportButton()).toBeEnabled());
}

test('the empty stage is the import control', () => {
  render(<Editor native={client()}/>);
  const importControl = within(workspace()).getByRole('button', {name: '选择图片'});
  expect(importControl).toHaveAccessibleDescription(/或将照片拖入窗口。正反面可一起处理，最多两张。/);
  expect(importControl).toHaveAccessibleDescription(/静态 JPG \/ PNG · 每张不超过 50 MiB/);
  expect(screen.getAllByRole('button', {name: '选择图片'})).toHaveLength(1);
});

test('import shows progress while the file dialog is open', async () => {
  let finish!: (images: SessionView[]) => void;
  render(<Editor native={client({chooseImages: () => new Promise(resolve => {finish = resolve;})})}/>);
  await userEvent.click(screen.getByRole('button', {name: '选择图片'}));
  const importControl = screen.getByRole('button', {name: '选择图片'});
  expect(importControl).toHaveAttribute('aria-busy', 'true');
  expect(importControl).toHaveAccessibleDescription(/请在系统窗口中选择图片…/);
  await act(async () => finish([front]));
  expect(screen.getByText(front.displayName)).toBeInTheDocument();
});

test('the strip offers a second image, selects it once imported, then says why it is full', async () => {
  const native = client();
  vi.mocked(native.chooseImages).mockResolvedValueOnce([front]).mockResolvedValueOnce([front, back]);
  await openWithFront(native);
  const strip = screen.getByRole('group', {name: '已导入的图片'});
  const addSecond = within(strip).getByRole('button', {name: '选择图片'});
  expect(addSecond).toHaveAccessibleDescription('添加第二张，如反面');
  expect(screen.getAllByRole('button', {name: '选择图片'})).toHaveLength(1);

  await userEvent.click(addSecond);
  await screen.findByText(back.displayName);
  expect(screen.queryByRole('button', {name: '选择图片'})).not.toBeInTheDocument();
  expect(screen.getByText('已满两张 · 移除一张后可再添加')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: /^\d+\s*合成反面\.png$/})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', {name: /^\d+\s*合成正面\.png$/})).toHaveAttribute('aria-pressed', 'false');
  await waitFor(() => expect(native.requestPreview).toHaveBeenLastCalledWith(expect.objectContaining({sessionId: back.id})));
});

test('the export status line gives the first reason export is blocked', async () => {
  const native = client({
    requestPreview: vi.fn(request => request.watermark?.text === '慢慢生成' ? new Promise<Uint8Array>(() => {}) : Promise.resolve(new Uint8Array([1]))),
  });
  render(<Editor native={native}/>);
  expect(exportButton()).toHaveAccessibleDescription('先选择需要加水印的图片');

  await userEvent.click(screen.getByRole('button', {name: '选择图片'}));
  await screen.findByText(front.displayName);
  expect(exportButton()).toHaveAccessibleDescription('填写水印内容后即可导出');

  writeWatermark('中'.repeat(201));
  expect(exportButton()).toHaveAccessibleDescription('水印内容需要修改，见上方提示');
  expect(screen.getByText('水印内容最多 200 个字符')).toBeInTheDocument();

  writeWatermark('慢慢生成');
  expect(exportButton()).toHaveAccessibleDescription('正在生成预览…');
  expect(exportButton()).toBeDisabled();

  writeWatermark('仅供测试使用');
  await waitFor(() => expect(exportButton()).toBeEnabled());
  expect(exportButton()).toHaveAccessibleDescription('每次选择保存位置，不覆盖原图或已有文件。');

  writeWatermark(TEMPLATE);
  await waitFor(() => expect(exportButton()).toBeEnabled());
  expect(exportButton()).toHaveAccessibleDescription('水印里还有未填写的【…】，导出前请确认。');
});

test('a failed preview and a running export each block export with their own reason', async () => {
  const native = client({startExport: vi.fn(() => new Promise<never>(() => {}))});
  vi.mocked(native.requestPreview).mockImplementation(async request => {
    if (request.watermark?.text === '测试🛸') throw {message: '字体无法显示某些字符，请修改水印内容'};
    return new Uint8Array([1]);
  });
  await openWithFront(native);
  writeWatermark('测试🛸');
  expect(await within(workspace()).findByRole('alert')).toHaveTextContent('字体无法显示某些字符，请修改水印内容');
  expect(exportButton()).toHaveAccessibleDescription('预览未生成，暂不能导出');

  writeWatermark('仅供测试使用');
  await waitFor(() => expect(exportButton()).toBeEnabled());
  await userEvent.click(exportButton());
  await waitFor(() => expect(exportButton()).toHaveAccessibleDescription('正在另存…'));
  expect(exportButton()).toBeDisabled();
});

test('the browser preview cannot import or export and says where to do it', () => {
  render(<Editor native={client({available: false})}/>);
  expect(screen.getByText('当前为浏览器界面预览。请选择桌面应用来导入和处理图片。')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: '选择图片'})).toBeDisabled();
  expect(exportButton()).toHaveAccessibleDescription('请在桌面应用中导入和导出');
});

test('an import error appears above the stage, not in the export dock', async () => {
  render(<Editor native={client({chooseImages: vi.fn(async () => {throw {message: '无法读取这张图片'};})})}/>);
  await userEvent.click(screen.getByRole('button', {name: '选择图片'}));
  expect(await within(workspace()).findByRole('alert')).toHaveTextContent('无法读取这张图片');
  expect(within(inspector()).queryByRole('alert')).not.toBeInTheDocument();
});

test('an export error appears in the export dock, not above the stage', async () => {
  const native = client({startExport: vi.fn(async () => {throw {message: '无法写入，请选择其他文件夹'};})});
  await readyToExport(native);
  await userEvent.click(exportButton());
  expect(await within(inspector()).findByRole('alert')).toHaveTextContent('无法写入，请选择其他文件夹');
  expect(within(workspace()).queryByRole('alert')).not.toBeInTheDocument();
});

test('cancelling the folder dialog says that nothing was exported', async () => {
  const native = client({chooseExportDirectory: vi.fn(async () => null)});
  await readyToExport(native);
  await userEvent.click(exportButton());
  expect(await within(inspector()).findByText('已取消选择保存位置，未导出图片。')).toBeInTheDocument();
  expect(native.startExport).not.toHaveBeenCalled();
});

test('the template fills blank text with 【接收方】 selected and asks before replacing typed text', async () => {
  render(<Editor native={client()}/>);
  const text = screen.getByRole<HTMLTextAreaElement>('textbox', {name: '水印内容'});
  const selected = () => text.value.slice(text.selectionStart, text.selectionEnd);

  await userEvent.click(screen.getByRole('button', {name: '填入用途模板'}));
  expect(text).toHaveValue(TEMPLATE);
  expect(text).toHaveFocus();
  expect(selected()).toBe('【接收方】');
  await userEvent.keyboard('示例银行');
  expect(text).toHaveValue('仅供示例银行办理【具体事项】使用');

  writeWatermark('我自己写的用途');
  await userEvent.click(screen.getByRole('button', {name: '填入用途模板'}));
  expect(text).toHaveValue('我自己写的用途');
  expect(screen.getByRole('group', {name: '替换现有内容？'})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', {name: '保留'}));
  expect(text).toHaveValue('我自己写的用途');
  expect(screen.queryByRole('group', {name: '替换现有内容？'})).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', {name: '填入用途模板'}));
  await userEvent.click(screen.getByRole('button', {name: '替换'}));
  expect(text).toHaveValue(TEMPLATE);
  expect(selected()).toBe('【接收方】');
});

test('the collapsed style section shows its current values', () => {
  render(<Editor native={client()}/>);
  expect(screen.getByText('透明度 24% · 角度 −30° · 字号 3.5%')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('透明度'), {target: {value: '40'}});
  expect(screen.getByText('透明度 40% · 角度 −30° · 字号 3.5%')).toBeInTheDocument();
});

test('100% detail opens centred and moves with arrow keys until Escape returns to fit', async () => {
  const native = client();
  await readyToExport(native);
  await userEvent.click(screen.getByRole('radio', {name: '100% 细节'}));
  await waitFor(() => expect(lastTarget(native)).toEqual({kind: 'detail', x: 750, y: 500, width: 900, height: 600}));

  const viewport = screen.getByRole('group', {name: '100% 细节区域'});
  expect(viewport).toHaveAccessibleDescription('拖动图片或按方向键移动，Esc 返回');
  fireEvent.keyDown(viewport, {key: 'ArrowRight'});
  await waitFor(() => expect(lastTarget(native)).toEqual({kind: 'detail', x: 870, y: 500, width: 900, height: 600}));
  fireEvent.keyDown(viewport, {key: 'ArrowDown', shiftKey: true});
  await waitFor(() => expect(lastTarget(native)).toEqual({kind: 'detail', x: 870, y: 980, width: 900, height: 600}));
  fireEvent.keyDown(viewport, {key: 'ArrowDown', shiftKey: true});
  await waitFor(() => expect(lastTarget(native)).toEqual({kind: 'detail', x: 870, y: 1000, width: 900, height: 600}));

  fireEvent.keyDown(viewport, {key: 'Escape'});
  await waitFor(() => expect(lastTarget(native)).toEqual({kind: 'fit', maxEdge: 1600}));
  expect(screen.getByRole('radio', {name: '适应窗口'})).toBeChecked();
  expect(screen.queryByRole('group', {name: '100% 细节区域'})).not.toBeInTheDocument();
});

test('clicking the fit preview opens 100% detail centred on the clicked point', async () => {
  const native = client();
  await readyToExport(native);
  const image = screen.getByAltText('Rust 生成的水印预览');
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({left: 100, top: 50, width: 600, height: 400, right: 700, bottom: 450, x: 100, y: 50, toJSON: () => ({})});
  fireEvent.click(image, {clientX: 100 + 450, clientY: 50 + 100});
  await waitFor(() => expect(lastTarget(native)).toEqual({kind: 'detail', x: 1350, y: 100, width: 900, height: 600}));
  expect(screen.getByRole('radio', {name: '100% 细节'})).toBeChecked();
});

test('the format radio group decides the exported format', async () => {
  const native = client();
  await readyToExport(native);
  const formats = screen.getByRole('radiogroup', {name: '导出格式'});
  expect(within(formats).getByRole('radio', {name: 'JPEG'})).toBeChecked();
  expect(within(formats).getByRole('radio', {name: 'PNG'})).toHaveAccessibleDescription('无损保存合成像素');
  await userEvent.click(within(formats).getByRole('radio', {name: 'PNG'}));
  await userEvent.click(exportButton());
  await waitFor(() => expect(native.startExport).toHaveBeenCalledWith(expect.objectContaining({format: 'png', sessionIds: [front.id]})));
});

test('the top bar holds the theme switch and opens privacy notes as a dismissable panel', async () => {
  render(<Editor native={client()}/>);
  expect(screen.getByRole('radio', {name: '跟随系统'})).toBeChecked();
  const trigger = screen.getByRole('button', {name: '隐私须知'});

  await userEvent.click(trigger);
  const panel = screen.getByRole('dialog', {name: '隐私与使用须知'});
  expect(within(panel).getByText('一份明确的用途声明，不是绝对的安全保证。')).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();

  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole('heading', {name: '证件水印'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});