import { useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { Check, EyeOff, ImagePlus, LockKeyhole } from 'lucide-react';
import { Segmented } from '../../ui/Segmented';
import { DETAIL_STEP, pointInImage } from './model';
import type { SessionView } from './native';
import type { EditorController } from './useEditor';

const ARROWS: Partial<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

type Drag = {x: number; y: number; dx: number; dy: number};

export function Stage({editor}: {editor: EditorController}) {
  return editor.active ? <ImageStage editor={editor} image={editor.active}/> : <EmptyStage editor={editor}/>;
}

function EmptyStage({editor}: {editor: EditorController}) {
  const importing = editor.activity.kind === 'importing';
  return <>
    <div className="stage">
      <button
        type="button"
        className="dropzone"
        aria-labelledby="dropzone-title"
        aria-describedby="dropzone-hint dropzone-meta"
        aria-busy={importing}
        disabled={!editor.available || editor.busy}
        onClick={editor.importImages}
      >
        <span className="dropzone-icon"><ImagePlus size={22}/></span>
        <span id="dropzone-title" className="dropzone-title">选择图片</span>
        <span id="dropzone-hint" className="dropzone-hint">{importing ? '请在系统窗口中选择图片…' : '或将照片拖入窗口。正反面可一起处理，最多两张。'}</span>
        <span id="dropzone-meta" className="dropzone-meta">静态 JPG / PNG · 每张不超过 50 MiB</span>
      </button>
    </div>
    <div className="stage-bar">
      <p className="stage-meta"><LockKeyhole size={14}/><span>照片与水印内容不上传，不保留编辑历史。</span></p>
    </div>
  </>;
}

function ImageStage({editor, image}: {editor: EditorController; image: SessionView}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const {preview, view} = editor;
  const detail = view.kind === 'detail';
  const zoomable = !detail && editor.detailAvailable && !editor.busy;
  const hint = detail ? '拖动图片或按方向键移动，Esc 返回'
    : editor.detailAvailable ? '点击图片查看该处 100% 细节'
      : '填写水印内容后可查看 100% 细节';

  function inspect(event: MouseEvent<HTMLImageElement>) {
    const point = pointInImage(image, event.currentTarget.getBoundingClientRect(), {x: event.clientX, y: event.clientY});
    editor.showDetail(point);
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.showFit();
      return;
    }
    const direction = ARROWS[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? DETAIL_STEP * 4 : DETAIL_STEP;
    editor.moveDetail(direction[0] * step, direction[1] * step);
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (editor.busy || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({x: event.clientX, y: event.clientY, dx: 0, dy: 0});
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag) setDrag({...drag, dx: event.clientX - drag.x, dy: event.clientY - drag.y});
  }

  function pointerUp() {
    if (!drag) return;
    setDrag(null);
    editor.moveDetail(-drag.dx, -drag.dy);
  }

  function body() {
    switch (preview.status) {
      case 'none':
        return null;
      case 'updating':
        return <p className="stage-message" role="status">正在本机生成预览…</p>;
      case 'paused':
        return <p className="stage-message">修改右侧内容后，即可查看新预览。</p>;
      case 'failed':
        return <p className="stage-message is-error" role="alert">{preview.message}</p>;
      case 'ready':
        return <img
          className={detail ? 'preview-image is-actual' : zoomable ? 'preview-image is-zoomable' : 'preview-image'}
          src={preview.url}
          alt={preview.marked ? 'Rust 生成的水印预览' : '尚未添加水印的确认缩略图'}
          draggable={false}
          style={drag ? {transform: `translate(${drag.dx}px, ${drag.dy}px)`} : undefined}
          onClick={zoomable ? inspect : undefined}
        />;
      default: {
        const unhandled: never = preview;
        return unhandled;
      }
    }
  }

  // One viewport node for both views, so focus stays put when Escape returns to fit.
  return <>
    <div className="stage">
      <div
        className={detail ? 'viewport is-detail' : 'viewport'}
        tabIndex={detail ? 0 : -1}
        role={detail ? 'group' : undefined}
        aria-label={detail ? '100% 细节区域' : undefined}
        aria-describedby={detail ? 'stage-hint' : undefined}
        onKeyDown={detail ? keyDown : undefined}
        onPointerDown={detail ? pointerDown : undefined}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        {body()}
      </div>
      {preview.status === 'ready' && !preview.marked && <span className="unmarked-tag"><EyeOff size={14}/>未加水印 · 仅供确认</span>}
    </div>
    <div className="stage-bar">
      <p className="stage-meta">
        {preview.status === 'ready' && preview.marked && <span className="stage-status"><Check size={14}/>水印已合成</span>}
        <span>{image.width.toLocaleString()} × {image.height.toLocaleString()} px</span>
        <span id="stage-hint" className="stage-hint">{hint}</span>
      </p>
      <Segmented
        className="view-switch"
        label="预览方式"
        value={view.kind}
        disabled={editor.busy}
        options={[
          {value: 'fit', label: '适应窗口'},
          {value: 'detail', label: '100% 细节', disabled: !editor.detailAvailable},
        ]}
        onChange={kind => kind === 'fit' ? editor.showFit() : editor.showDetail(null)}
      />
    </div>
  </>;
}