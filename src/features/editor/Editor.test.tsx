import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { Editor } from './Editor';
import type { NativeClient, SessionView } from './native';

const photo: SessionView = { id: 'front', displayName: '合成证件.png', width: 1200, height: 800 };
function client(): NativeClient {
  return {
    available: true,
    getSessions: async () => [],
    chooseImages: vi.fn(async () => [photo]),
    removeImage: vi.fn(async () => []),
    requestPreview: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
    chooseExportDirectory: vi.fn(async () => 'directory-token'),
    startExport: vi.fn(async () => ({ batchId: 'batch', results: [{ sessionId: photo.id, status: 'success' as const, outputName: '合成证件_watermarked.jpg' }] })),
    retryExport: vi.fn(async () => ({ batchId: 'batch', results: [] })),
    subscribeImports: async () => () => {},
  };
}
test('late startup state cannot replace an imported photo', async () => {
  const native=client();
  let resolveStartup!: (images: SessionView[]) => void;
  native.getSessions=()=>new Promise(resolve=>{resolveStartup=resolve;});
  render(<Editor native={native}/>);
  await userEvent.click(screen.getByRole('button',{name:'选择图片'}));
  await screen.findByText(photo.displayName);
  await act(async()=>{resolveStartup([]);});
  expect(screen.getByText(photo.displayName)).toBeInTheDocument();
});

test('invalid text never pretends a preview is still generating', async () => {
  render(<Editor native={client()}/>);
  await userEvent.click(screen.getByRole('button',{name:'选择图片'}));
  await screen.findByText(photo.displayName);
  fireEvent.change(screen.getByLabelText('水印内容'),{target:{value:'中'.repeat(201)}});
  expect(screen.getByText('水印内容最多 200 个字符')).toBeInTheDocument();
  expect(screen.queryByText('正在本机生成预览…')).not.toBeInTheDocument();
});

test('an all-failed export is not described as partial success',async()=>{
  const native=client();
  native.startExport=async()=>({batchId:'failed',results:[{sessionId:photo.id,status:'failed',errorCode:'write_failed',message:'无法写入，请选择其他文件夹'}]});
  render(<Editor native={native}/>);
  await userEvent.click(screen.getByRole('button',{name:'选择图片'}));
  await screen.findByText(photo.displayName);
  fireEvent.change(screen.getByLabelText('水印内容'),{target:{value:'仅供测试使用'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'导出当前图片'})).toBeEnabled());
  await userEvent.click(screen.getByRole('button',{name:'导出当前图片'}));
  expect(await screen.findByText('导出未完成')).toBeInTheDocument();
});

test('older preview completion is ignored and object URLs are released',async()=>{
  const native=client();
  let finishOld!: (bytes:Uint8Array)=>void;
  native.requestPreview=vi.fn(request=>request.watermark?.text==='旧用途' ? new Promise<Uint8Array>(resolve=>{finishOld=resolve;}) : Promise.resolve(new Uint8Array([1,2,3])));
  const view=render(<Editor native={native}/>);
  await userEvent.click(screen.getByRole('button',{name:'选择图片'}));
  await screen.findByText(photo.displayName);
  fireEvent.change(screen.getByLabelText('水印内容'),{target:{value:'旧用途'}});
  await waitFor(()=>expect(native.requestPreview).toHaveBeenCalledWith(expect.objectContaining({watermark:expect.objectContaining({text:'旧用途'})})));
  fireEvent.change(screen.getByLabelText('水印内容'),{target:{value:'新用途'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'导出当前图片'})).toBeEnabled());
  await act(async()=>finishOld(new Uint8Array([9,9])));
  expect(screen.getByAltText('Rust 生成的水印预览')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'导出当前图片'})).toBeEnabled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});

test('export freezes edits until the captured batch finishes',async()=>{
  const native=client();
  let finish!: (report:Awaited<ReturnType<NativeClient['startExport']>>)=>void;
  native.startExport=vi.fn(()=>new Promise<Awaited<ReturnType<NativeClient['startExport']>>>(resolve=>{finish=resolve;}));
  render(<Editor native={native}/>);
  await userEvent.click(screen.getByRole('button',{name:'选择图片'}));
  await screen.findByText(photo.displayName);
  fireEvent.change(screen.getByLabelText('水印内容'),{target:{value:'固定用途'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'导出当前图片'})).toBeEnabled());
  await userEvent.click(screen.getByRole('button',{name:'导出当前图片'}));
  await waitFor(()=>expect(native.startExport).toHaveBeenCalled());
  expect(screen.getByLabelText('水印内容')).toBeDisabled();
  expect(screen.getByRole('button',{name:'选择图片'})).toBeDisabled();
  expect(screen.getByRole('button',{name:`移除 ${photo.displayName}`})).toBeDisabled();
  await act(async()=>finish({batchId:'done',results:[{sessionId:photo.id,status:'success',outputName:'safe.jpg'}]}));
  expect(screen.getByText('safe.jpg')).toBeInTheDocument();
});

test('partial failures identify the input and retry the original batch',async()=>{
  const native=client();const back={...photo,id:'back',displayName:'合成反面.png'};
  native.chooseImages=async()=>[photo,back];
  native.startExport=async()=>({batchId:'partial',results:[{sessionId:photo.id,status:'success',outputName:'front.jpg'},{sessionId:back.id,status:'failed',errorCode:'write_failed',message:'无法写入，请选择其他文件夹'}]});
  render(<Editor native={native}/>);
  await userEvent.click(screen.getByRole('button',{name:'选择图片'}));
  await screen.findByText(photo.displayName);
  fireEvent.change(screen.getByLabelText('水印内容'),{target:{value:'仅供测试'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'导出全部 2 张'})).toBeEnabled());
  await userEvent.click(screen.getByRole('button',{name:'导出全部 2 张'}));
  expect(await screen.findByText('合成反面.png：无法写入，请选择其他文件夹')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'重试失败项（沿用原批次水印）'}));
  await waitFor(()=>expect(native.retryExport).toHaveBeenCalledWith('partial','directory-token'));
});

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
});

test('guides import and does not export empty watermark content', async () => {
  render(<Editor native={client()} />);
  expect(screen.getByText('照片不上传')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导出当前图片' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '选择图片' }));
  expect(await screen.findByText('合成证件.png')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导出当前图片' })).toBeDisabled();
});

test('exports a fixed watermark through native processing, never a frontend overlay', async () => {
  const native = client();
  render(<Editor native={native} />);
  await userEvent.click(screen.getByRole('button', { name: '选择图片' }));
  await screen.findByText(photo.displayName);
  fireEvent.change(screen.getByLabelText('水印内容'), { target: { value: '仅供测试使用' } });
  await waitFor(() => expect(screen.getByRole('button', { name: '导出当前图片' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: '导出当前图片' }));
  expect(await screen.findByText('合成证件_watermarked.jpg')).toBeInTheDocument();
  expect(native.startExport).toHaveBeenCalledWith(expect.objectContaining({ sessionIds: ['front'], watermark: expect.objectContaining({ text: '仅供测试使用' }), format: 'jpeg' }));
});

test('cancelling a directory dialog never reports success or writes output', async () => {
  const native = client();
  native.chooseExportDirectory = async () => null;
  render(<Editor native={native} />);
  await userEvent.click(screen.getByRole('button', { name: '选择图片' }));
  await screen.findByText(photo.displayName);
  fireEvent.change(screen.getByLabelText('水印内容'), { target: { value: '仅供测试使用' } });
  await waitFor(() => expect(screen.getByRole('button', { name: '导出当前图片' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: '导出当前图片' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '导出当前图片' })).toBeEnabled());
  expect(native.startExport).not.toHaveBeenCalled();
  expect(screen.queryByText('导出完成')).not.toBeInTheDocument();
});

test('a render error blocks export and shows an actionable error', async () => {
  const native = client();
  native.requestPreview = async () => { throw { message: '字体无法显示某些字符，请修改水印内容' }; };
  render(<Editor native={native} />);
  await userEvent.click(screen.getByRole('button', { name: '选择图片' }));
  fireEvent.change(screen.getByLabelText('水印内容'), { target: { value: '测试🛸' } });
  expect(await screen.findByText('字体无法显示某些字符，请修改水印内容')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导出当前图片' })).toBeDisabled();
});
