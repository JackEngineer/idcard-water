import { CircleAlert } from 'lucide-react';
import '../theme/tokens.css';
import './editor.css';
import type { NativeClient } from './native';
import { useEditor } from './useEditor';
import { TopBar } from './TopBar';
import { ImageStrip } from './ImageStrip';
import { Stage } from './Stage';
import { Inspector } from './Inspector';

export function Editor({native}: {native: NativeClient}) {
  const editor = useEditor(native);
  const imagesNotice = editor.notice?.site === 'images' ? editor.notice : null;
  return <div className="app">
    <TopBar/>
    {!editor.available && <p className="browser-notice" role="status">当前为浏览器界面预览。请选择桌面应用来导入和处理图片。</p>}
    <main className="main">
      <section className="workspace" aria-label="图片工作区">
        <ImageStrip editor={editor}/>
        {imagesNotice && <p className="notice is-error" role="alert"><CircleAlert size={14}/><span>{imagesNotice.message}</span></p>}
        <Stage editor={editor}/>
      </section>
      <Inspector editor={editor}/>
    </main>
  </div>;
}
