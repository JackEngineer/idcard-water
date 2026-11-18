import {createRoot} from 'react-dom/client';
import {Editor} from '../src/features/editor/Editor';
import type {NativeClient} from '../src/features/editor/native';
async function call<T>(action: string, request: unknown = {}): Promise<T> {
  const response = await fetch(`/__verification/${action}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
  if (response.headers.get('Content-Type')?.startsWith('image/png')) return new Uint8Array(await response.arrayBuffer()) as T;
  const body = await response.json(); if (body.error) throw body.error; return body.value;
}
let cancelNext = false;
const native: NativeClient = {
  available:true,
  getSessions:()=>call('get_sessions'),chooseImages:()=>call('choose_images'),removeImage:sessionId=>call('remove_image',{sessionId}),
  requestPreview:request=>call('request_preview',request),
  chooseExportDirectory:()=>{if(cancelNext){cancelNext=false;return Promise.resolve(null);}return call('choose_export_directory');},
  startExport:request=>call('start_export',request),retryExport:(batchId,directoryToken)=>call('retry_export',{batchId,directoryToken}),
  subscribeImports:async()=>()=>{},
};
createRoot(document.getElementById('root')!).render(<><div style={{padding:'8px 24px',background:'var(--caution-soft)',color:'var(--caution)',borderBottom:'1px solid var(--caution-border)',fontSize:11}}>合成数据验收。图片由 Rust 处理并真实另存；文件选择为测试替身。<button style={{textDecoration:'underline'}} onClick={()=>{cancelNext=true;}}>下次取消文件夹选择</button></div><Editor native={native}/></>);