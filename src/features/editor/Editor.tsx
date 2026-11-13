import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, CalendarDays, Check, CheckCheck, Expand, ImagePlus, LockKeyhole, ScanLine, ShieldCheck, Trash2 } from 'lucide-react';
import { defaultWatermark, errorMessage, insertLocalDate, validateWatermark } from './model';
import type { WatermarkDraft } from './model';
import type { ExportReport, ExportRequest, NativeClient, OutputFormat, PreviewTarget, SessionView } from './native';
import './editor.css';

type DocumentState =
  | {phase: 'empty'; images: SessionView[]}
  | {phase: 'importing'; images: SessionView[]}
  | {phase: 'editing'; images: SessionView[]}
  | {phase: 'exporting'; images: SessionView[]; snapshot: ExportRequest | null};
type Preview = {key: string; status: 'loading' | 'ready' | 'failed'; url: string | null; error?: string};
function documents(images: SessionView[]): DocumentState { return {phase: images.length ? 'editing' : 'empty', images}; }

export function Editor({native}: {native: NativeClient}) {
  const [document, setDocument] = useState<DocumentState>(documents([]));
  const [activeId, setActiveId] = useState('');
  const [draft, setDraft] = useState(defaultWatermark);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [mode, setMode] = useState<'fit' | 'detail'>('fit');
  const [position, setPosition] = useState({x: 0, y: 0});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);
  const revision = useRef(0);
  const active = document.images.find(image => image.id === activeId) ?? document.images[0];
  const busy = document.phase === 'importing' || document.phase === 'exporting';
  const validation = validateWatermark(draft);
  const blank = !draft.text.trim();
  const target = useMemo<PreviewTarget>(() => mode === 'fit' || blank || !active
    ? {kind: 'fit', maxEdge: 1600}
    : {kind: 'detail', x: Math.min(position.x, Math.max(0, active.width - 900)), y: Math.min(position.y, Math.max(0, active.height - 600)), width: Math.min(active.width,900), height: Math.min(active.height,600)}, [mode, blank, active, position]);
  const previewKey = JSON.stringify([active?.id, draft, target]);
  const ready = preview?.key === previewKey && preview.status === 'ready' && !validation;
  const canExport = native.available && !busy && !!active && ready;

  useEffect(() => {
    if (!native.available) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void native.getSessions().then(images => {if (!disposed) setDocument(current => current.phase === 'empty' ? documents(images) : current);}).catch(error => {if (!disposed) setNotice(errorMessage(error));});
    void native.subscribeImports((images, error) => {
      if (disposed) return;
      if (error) setNotice(errorMessage(error));
      if (images) {setDocument(current => current.phase === 'exporting' ? current : documents(images)); setNotice(null); setReport(null);}
    }).then(stop => {if (disposed) stop(); else unsubscribe = stop;}).catch(error => {if (!disposed) setNotice(errorMessage(error));});
    return () => {disposed = true; unsubscribe?.();};
  }, [native]);

  useEffect(() => {
    if (!active || !native.available || (validation && !blank)) return;
    let disposed = false;
    let objectUrl: string | null = null;
    const currentRevision = ++revision.current;
    setPreview({key: previewKey, status: 'loading', url: null});
    const timeout = setTimeout(() => {
      void native.requestPreview({sessionId: active.id, revision: currentRevision, watermark: blank ? null : structuredClone(draft), target}).then(bytes => {
        if (disposed || currentRevision !== revision.current) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], {type: 'image/png'}));
        setPreview({key: previewKey, status: 'ready', url: objectUrl});
      }).catch(error => {
        if (!disposed && currentRevision === revision.current) setPreview({key: previewKey, status: 'failed', url: null, error: errorMessage(error)});
      });
    }, 180);
    return () => {disposed = true; clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl);};
  }, [native, previewKey, active, draft, target, validation, blank]);

  function updateDraft(change: Partial<WatermarkDraft>) {setDraft(current => ({...current, ...change})); setReport(null); setNotice(null);}
  async function importImages() {
    setNotice(null); setDocument({phase: 'importing', images: document.images});
    try {const images = await native.chooseImages(); setDocument(documents(images)); setReport(null);}
    catch (error) {setNotice(errorMessage(error)); setDocument(documents(document.images));}
  }
  async function remove(id: string) {
    setDocument({phase: 'importing', images: document.images});
    try {setDocument(documents(await native.removeImage(id))); setReport(null); setNotice(null);}
    catch (error) {setNotice(errorMessage(error)); setDocument(documents(document.images));}
  }
  async function exportImages(all: boolean, retry = false) {
    if (!retry && (!canExport || !active)) return;
    const images = document.images;
    const snapshot: ExportRequest | null = retry ? null : {sessionIds: all ? images.map(image => image.id) : [active!.id], watermark: structuredClone(draft), format, directoryToken: ''};
    setDocument({phase: 'exporting', images, snapshot}); setNotice(null);
    try {
      const directoryToken = await native.chooseExportDirectory();
      if (!directoryToken) return;
      const result = retry && report ? await native.retryExport(report.batchId, directoryToken) : await native.startExport({...snapshot!, directoryToken});
      setReport(result);
    } catch (error) {setNotice(errorMessage(error));}
    finally {setDocument(documents(images));}
  }
  function switchImage(id: string) {setActiveId(id); setMode('fit'); setPosition({x: 0,y: 0});}
  const previewStatus = !active ? '等待导入图片' : validation && !blank ? '请修改水印内容' : preview?.key === previewKey && preview.status === 'failed' ? '预览未完成' : preview?.key !== previewKey || preview?.status === 'loading' ? '正在生成预览' : blank ? '未加水印 · 仅供确认' : '水印已合成';

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><span className="brand-mark"><ScanLine size={24}/></span><div><h1>证件水印</h1><span className="brand-caption">留一份用途，少一分顾虑。</span></div></div>
      <span className="local-badge"><span className="status-dot"/>本机处理<span className="badge-divider"/><span>照片不上传</span></span>
    </header>
    {!native.available && <div className="browser-notice" role="status">当前为浏览器界面预览。请选择桌面应用来导入和处理图片。</div>}
    <main className="editor-layout">
      <section className="workspace" aria-label="图片工作区">
        <div className="workspace-heading"><div><span className="eyebrow">01 / 图片</span><h2>需要分享的照片</h2></div><button className="secondary-button" onClick={() => void importImages()} disabled={busy || !native.available || document.images.length >= 2}><ImagePlus size={17}/>选择图片</button></div>
        <div className="image-tabs" aria-label="已导入的图片">{document.images.map((image,index) => <div className={`image-tab ${active?.id === image.id ? 'selected' : ''}`} key={image.id}><button className="image-tab-select" aria-pressed={active?.id === image.id} disabled={busy} onClick={() => switchImage(image.id)}><span className="image-index">{String(index+1).padStart(2,'0')}</span><span className="image-name">{image.displayName}</span></button><button className="icon-button" disabled={busy} aria-label={`移除 ${image.displayName}`} onClick={() => void remove(image.id)}><Trash2 size={15}/></button></div>)}</div>
        <div className={`preview-stage ${active ? 'has-image' : ''}`} aria-busy={!!active && previewStatus === '正在生成预览'}>
          {!active ? <div className="empty-state"><div className="empty-frame" aria-hidden="true"><ScanLine size={46} strokeWidth={1}/><span>仅在你的设备上</span></div><h3>先选一张证件照片</h3><p>也可以将照片拖入桌面窗口。<br/>正反面可一起处理，最多两张。</p><span className="format-note">静态 JPG / PNG · 每张不超过 50 MiB</span></div> : <>
            <div className={`preview-image-scroll ${mode === 'detail' && !blank ? 'actual-size' : ''}`}>
              {preview?.key === previewKey && preview.url && <img src={preview.url} alt={blank ? '尚未添加水印的确认缩略图' : 'Rust 生成的水印预览'}/>}
              {!(validation && !blank) && (!preview || preview.key !== previewKey || preview.status === 'loading') && <span className="loading-text" role="status">正在本机生成预览…</span>}
              {validation && !blank && <p className="preview-placeholder">修改右侧内容后，即可查看新预览。</p>}
              {preview?.key === previewKey && preview.error && <p className="preview-error" role="alert">{preview.error}</p>}
            </div>
            <span className={`preview-label ${blank ? 'unmarked' : ''}`}>{!blank && ready && <Check size={13}/>} {previewStatus}</span>
          </>}
        </div>
        <div className="preview-toolbar"><span>{active ? `${active.width.toLocaleString()} × ${active.height.toLocaleString()} px` : '原图保留，结果另存'}</span><div className="view-switch"><button aria-pressed={mode === 'fit'} disabled={!active || busy} onClick={() => setMode('fit')}><Expand size={14}/>适应窗口</button><button aria-pressed={mode === 'detail'} disabled={!active || blank || !!validation || busy} onClick={() => setMode('detail')}>100% 细节</button></div></div>
        {mode === 'detail' && active && !blank && <div className="detail-controls"><label>水平位置<input type="range" min="0" max={Math.max(0,active.width-900)} value={position.x} disabled={busy} onChange={event => setPosition({...position,x:Number(event.target.value)})}/></label><label>垂直位置<input type="range" min="0" max={Math.max(0,active.height-600)} value={position.y} disabled={busy} onChange={event => setPosition({...position,y:Number(event.target.value)})}/></label><span>查看原分辨率局部像素，可滚动检查。</span></div>}
        <p className="workspace-note"><LockKeyhole size={14}/>照片与水印内容不上传，不保留编辑历史。</p>
      </section>
      <aside className="settings" aria-label="水印与导出设置">
        <div className="settings-heading"><span className="eyebrow">02 / 水印</span><h2>说清楚，这张照片的用途</h2><p>建议写明接收方、办理事项和日期。</p></div>
        <fieldset disabled={busy} className="watermark-fields"><div className="field-heading"><label htmlFor="watermark-text">水印内容</label><span className={[...draft.text].length > 200 ? 'invalid-count' : ''}>{[...draft.text].length} / 200</span></div>
          <textarea id="watermark-text" rows={4} placeholder={'仅供【接收方】\n办理【具体事项】使用'} value={draft.text} onChange={event => updateDraft({text:event.target.value})} aria-describedby="text-guidance"/>
          <div className="text-actions"><button type="button" onClick={() => updateDraft({text:'仅供【接收方】办理【具体事项】使用'})}>填入用途模板</button><button type="button" onClick={() => updateDraft({text:insertLocalDate(draft.text,new Date())})}><CalendarDays size={14}/>插入日期</button></div>
          <p id="text-guidance" className={`field-help ${validation && !blank ? 'error-copy' : ''}`}>{validation && !blank ? validation : '最多 4 行。文字将倾斜、重复覆盖图片。'}</p>
          <details className="style-settings"><summary>调整水印样式<span>透明度、角度、字号与颜色</span></summary><div className="style-controls">
            <label>透明度 <output>{Math.round(draft.opacity*100)}%</output><input type="range" min="10" max="60" value={Math.round(draft.opacity*100)} onChange={event => updateDraft({opacity:Number(event.target.value)/100})}/></label>
            <label>倾斜角度 <output>{draft.angleDeg}°</output><input type="range" min="-60" max="60" value={draft.angleDeg} onChange={event => updateDraft({angleDeg:Number(event.target.value)})}/></label>
            <label>相对字号 <output>{(draft.sizeRatio*100).toFixed(1)}%</output><input type="range" min="1" max="12" step="0.1" value={draft.sizeRatio*100} onChange={event => updateDraft({sizeRatio:Number(event.target.value)/100})}/></label>
            <label className="color-field">文字颜色<input type="color" value={`#${draft.color.map(channel => channel.toString(16).padStart(2,'0')).join('')}`} onChange={event => updateDraft({color:[1,3,5].map(index => parseInt(event.target.value.slice(index,index+2),16)) as [number,number,number]})}/></label>
            <button className="text-button" type="button" onClick={() => updateDraft({...defaultWatermark(),text:draft.text})}>恢复默认样式</button>
          </div></details>
        </fieldset>
        <div className="export-section"><span className="eyebrow">03 / 另存</span><div className="field-heading"><label htmlFor="export-format">导出格式</label><span>保持原分辨率</span></div><select id="export-format" value={format} disabled={busy} onChange={event => {setFormat(event.target.value as OutputFormat);setReport(null);}}><option value="jpeg">JPEG · 适合日常发送</option><option value="png">PNG · 无损保存合成像素</option></select>
          <button className="primary-button" disabled={!canExport} onClick={() => void exportImages(false)}><ArrowDownToLine size={17}/>{document.phase === 'exporting' ? '正在另存…' : '导出当前图片'}</button>
          {document.images.length === 2 && <button className="secondary-button export-all" disabled={!canExport} onClick={() => void exportImages(true)}><CheckCheck size={17}/>导出全部 2 张</button>}
          <p className="export-help">{blank ? '输入水印内容后，即可预览并导出。' : '每次选择保存位置，不覆盖原图或已有文件。'}</p>
        </div>
        {notice && <p className="operation-notice" role="alert">{notice}</p>}
        {report && <div className="export-report" role="status"><strong>{report.results.every(item => item.status === 'success') ? '导出完成' : report.results.some(item => item.status === 'success') ? '部分图片未能导出' : '导出未完成'}</strong><ul>{report.results.map(item => <li key={item.sessionId}>{item.status === 'success' ? <><Check size={14}/><span>{item.outputName}</span></> : <span>{document.images.find(image => image.id === item.sessionId)?.displayName ?? '图片'}：{item.message}</span>}</li>)}</ul>{report.results.some(item => item.status === 'failed') && <button disabled={busy} onClick={() => void exportImages(false,true)}>重试失败项（沿用原批次水印）</button>}</div>}
      </aside>
    </main>
    <footer className="app-footer"><span><ShieldCheck size={16}/>一份明确的用途声明，不是绝对的安全保证。</span><details><summary>隐私与使用须知</summary><p>应用不上传照片、不使用远程字体、不收集使用记录。输出会重新编码，不复制原图的 EXIF、GPS 或嵌入缩略图。水印仍可能被移除，无法阻止转发；系统云同步、备份、交换内存和截图不受本应用控制。关闭应用会释放会话，但不承诺安全擦除内存。请确认水印未遮挡必要信息，再发送给可信的接收方。</p></details></footer>
  </div>;
}
