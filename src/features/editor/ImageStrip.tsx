import { Plus, X } from 'lucide-react';
import type { EditorController } from './useEditor';

export function ImageStrip({editor}: {editor: EditorController}) {
  const {images, active, activity} = editor;
  if (!images.length) return null;
  const importing = activity.kind === 'importing';
  return <div className="strip" role="group" aria-label="已导入的图片">
    {images.map((image, index) => {
      const selected = image.id === active?.id;
      return <div key={image.id} className={selected ? 'slot is-active' : 'slot'}>
        <button type="button" className="slot-select" aria-pressed={selected} disabled={editor.busy} onClick={() => editor.selectImage(image.id)}>
          <span className="slot-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="slot-name">{image.displayName}</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`移除 ${image.displayName}`}
          aria-busy={activity.kind === 'removing' && activity.sessionId === image.id}
          disabled={editor.busy}
          onClick={() => editor.removeImage(image.id)}
        >
          <X size={15}/>
        </button>
      </div>;
    })}
    {images.length === 1
      ? <button
        type="button"
        className="slot-add"
        aria-labelledby="add-title"
        aria-describedby="add-hint"
        aria-busy={importing}
        disabled={!editor.available || editor.busy}
        onClick={editor.importImages}
      >
        <Plus size={15}/>
        <span id="add-title">选择图片</span>
        <span id="add-hint" className="slot-add-hint">{importing ? '请在系统窗口中选择图片…' : '添加第二张，如反面'}</span>
      </button>
      : <p className="strip-full">已满两张 · 移除一张后可再添加</p>}
  </div>;
}