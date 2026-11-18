import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownToLine, CalendarDays, Check, CheckCheck, ChevronRight, CircleAlert, FileText, Info, LoaderCircle, RotateCcw, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Segmented } from '../../ui/Segmented';
import type { SegmentedOption } from '../../ui/Segmented';
import { PURPOSE_TEMPLATE, blockCopy, firstPlaceholder, reportOutcome, reportTitle, styleSummary, styleValues } from './model';
import type { ExportGate } from './model';
import type { ExportReport, OutputFormat } from './native';
import type { EditorController } from './useEditor';

const FORMAT_OPTIONS: readonly SegmentedOption<OutputFormat>[] = [
  {value: 'jpeg', label: 'JPEG', hint: '适合日常发送'},
  {value: 'png', label: 'PNG', hint: '无损保存合成像素'},
];

type StatusTone = 'quiet' | 'blocked' | 'busy' | 'caution';

const STATUS_ICONS: Record<StatusTone, ReactNode> = {
  quiet: <ShieldCheck size={14}/>,
  blocked: <Info size={14}/>,
  busy: <LoaderCircle size={14} className="spin"/>,
  caution: <TriangleAlert size={14}/>,
};

function statusLine(gate: ExportGate): {tone: StatusTone; text: string} {
  if (gate.open) return gate.warning ? {tone: 'caution', text: gate.warning} : {tone: 'quiet', text: '每次选择保存位置，不覆盖原图或已有文件。'};
  return {tone: gate.reason === 'exporting' ? 'busy' : 'blocked', text: blockCopy(gate.reason)};
}

const toHex = (color: readonly number[]) => `#${color.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (value: string) => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16)) as [number, number, number];

export function Inspector({editor}: {editor: EditorController}) {
  return <aside className="inspector" aria-label="水印与导出设置">
    <div className="inspector-body"><WatermarkFields editor={editor}/></div>
    <ExportDock editor={editor}/>
  </aside>;
}

function WatermarkFields({editor}: {editor: EditorController}) {
  const {draft, draftStatus} = editor;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<readonly [number, number] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const length = [...draft.text].length;
  const values = styleValues(draft);

  useLayoutEffect(() => {
    if (!selection || !textarea.current) return;
    textarea.current.focus();
    textarea.current.setSelectionRange(selection[0], selection[1]);
    setSelection(null);
  }, [selection]);

  function fillTemplate() {
    setConfirming(false);
    editor.editDraft({text: PURPOSE_TEMPLATE});
    setSelection(firstPlaceholder(PURPOSE_TEMPLATE));
  }

  function keepText() {
    setConfirming(false);
    textarea.current?.focus();
  }

  return <fieldset className="fields" disabled={editor.busy}>
    <div className="field-head">
      <label htmlFor="watermark-text" className="field-label">水印内容</label>
      <span className={length > 200 ? 'counter is-over' : 'counter'}>{length} / 200</span>
    </div>
    <textarea
      ref={textarea}
      id="watermark-text"
      rows={4}
      placeholder={'仅供【接收方】\n办理【具体事项】使用'}
      value={draft.text}
      aria-invalid={draftStatus.kind === 'invalid'}
      aria-describedby="text-help"
      onChange={event => editor.editDraft({text: event.target.value})}
    />
    {confirming
      ? <div className="confirm-inline" role="group" aria-labelledby="confirm-title">
        <span id="confirm-title">替换现有内容？</span>
        <button type="button" className="text-button" onClick={fillTemplate}>替换</button>
        <button type="button" className="text-button" onClick={keepText}>保留</button>
      </div>
      : <div className="text-actions">
        <button type="button" className="text-button" onClick={() => draft.text.trim() ? setConfirming(true) : fillTemplate()}><FileText size={14}/>填入用途模板</button>
        <button type="button" className="text-button" onClick={editor.insertDate}><CalendarDays size={14}/>插入日期</button>
      </div>}
    <p id="text-help" className={draftStatus.kind === 'invalid' ? 'field-help is-error' : 'field-help'}>
      {draftStatus.kind === 'invalid' ? draftStatus.message : '写明接收方、办理事项和日期。最多 4 行，文字会倾斜重复铺满图片。'}
    </p>
    <details className="style-panel">
      <summary>
        <ChevronRight size={14} className="style-chevron"/>
        <span className="style-title">水印样式</span>
        <span className="style-summary">{styleSummary(draft)}</span>
      </summary>
      <div className="style-grid">
        <div className="range-field">
          <label htmlFor="watermark-opacity">透明度</label>
          <output htmlFor="watermark-opacity">{values.opacity}</output>
          <input id="watermark-opacity" type="range" min="10" max="60" value={Math.round(draft.opacity * 100)} onChange={event => editor.editDraft({opacity: Number(event.target.value) / 100})}/>
        </div>
        <div className="range-field">
          <label htmlFor="watermark-angle">倾斜角度</label>
          <output htmlFor="watermark-angle">{values.angle}</output>
          <input id="watermark-angle" type="range" min="-60" max="60" value={draft.angleDeg} onChange={event => editor.editDraft({angleDeg: Number(event.target.value)})}/>
        </div>
        <div className="range-field">
          <label htmlFor="watermark-size">相对字号</label>
          <output htmlFor="watermark-size">{values.size}</output>
          <input id="watermark-size" type="range" min="1" max="12" step="0.1" value={draft.sizeRatio * 100} onChange={event => editor.editDraft({sizeRatio: Number(event.target.value) / 100})}/>
        </div>
        <div className="color-row">
          <label htmlFor="watermark-color">文字颜色</label>
          <input id="watermark-color" type="color" value={toHex(draft.color)} onChange={event => editor.editDraft({color: fromHex(event.target.value)})}/>
        </div>
        <button type="button" className="text-button reset-style" onClick={editor.resetStyle}>恢复默认样式</button>
      </div>
    </details>
  </fieldset>;
}

function ExportDock({editor}: {editor: EditorController}) {
  const {gate, images, notice, report, activity} = editor;
  const line = statusLine(gate);
  const exportNotice = notice?.site === 'export' ? notice : null;
  const pair = images.length === 2;
  const scope = activity.kind === 'exporting' ? activity.scope : null;
  return <div className="dock">
    <div className="format-field">
      <div className="field-head">
        <span className="field-label" aria-hidden="true">导出格式</span>
        <span className="field-note">保持原分辨率</span>
      </div>
      <Segmented className="format-switch" label="导出格式" value={editor.format} options={FORMAT_OPTIONS} disabled={editor.busy} onChange={editor.chooseFormat}/>
    </div>
    {exportNotice && <p className={`notice is-${exportNotice.tone}`} role={exportNotice.tone === 'error' ? 'alert' : 'status'}>
      {exportNotice.tone === 'error' ? <CircleAlert size={14}/> : <Info size={14}/>}
      <span>{exportNotice.message}</span>
    </p>}
    <p id="export-status" className={`dock-status is-${line.tone}`}>{STATUS_ICONS[line.tone]}<span>{line.text}</span></p>
    <div className={pair ? 'dock-actions is-pair' : 'dock-actions'}>
      {pair && <button type="button" className="button primary" disabled={!gate.open} aria-describedby="export-status" aria-busy={scope === 'all'} onClick={() => editor.exportImages('all')}>
        <CheckCheck size={16}/>导出全部 2 张
      </button>}
      <button type="button" className={images.length === 1 ? 'button primary' : 'button secondary'} disabled={!gate.open} aria-describedby="export-status" aria-busy={scope === 'current'} onClick={() => editor.exportImages('current')}>
        <ArrowDownToLine size={16}/>导出当前图片
      </button>
    </div>
    {report && <ExportReportView editor={editor} report={report}/>}
  </div>;
}

function ExportReportView({editor, report}: {editor: EditorController; report: ExportReport}) {
  const outcome = reportOutcome(report);
  return <section className={`report is-${outcome}`} role="status">
    <h3>{outcome === 'success' ? <Check size={14}/> : <CircleAlert size={14}/>}{reportTitle(outcome)}</h3>
    <ul>
      {report.results.map(item => item.status === 'success'
        ? <li key={item.sessionId}><Check size={14}/><span>{item.outputName}</span></li>
        : <li key={item.sessionId} className="is-failed"><X size={14}/><span>{editor.images.find(image => image.id === item.sessionId)?.displayName ?? '图片'}：{item.message}</span></li>)}
    </ul>
    {report.results.some(item => item.status === 'failed') && <button type="button" className="button secondary" disabled={editor.busy} onClick={editor.retryFailed}>
      <RotateCcw size={14}/>重试失败项（沿用原批次水印）
    </button>}
  </section>;
}