import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, ScanLine, ShieldCheck } from 'lucide-react';
import { ThemeSwitch } from '../theme/ThemeSwitch';

const PRIVACY_POINTS = [
  '应用不上传照片、不使用远程字体、不收集使用记录。',
  '输出会重新编码，不复制原图的 EXIF、GPS 或嵌入缩略图。',
  '水印仍可能被移除，无法阻止转发。',
  '系统云同步、备份、交换内存和截图不受本应用控制。',
  '关闭应用会释放会话，但不承诺安全擦除内存。',
  '请确认水印未遮挡必要信息，再发送给可信的接收方。',
];

export function TopBar() {
  return <header className="topbar">
    <div className="brand">
      <span className="brand-mark"><ScanLine size={18}/></span>
      <h1>证件水印</h1>
    </div>
    <p className="local-badge">
      <LockKeyhole size={14}/>
      <span>本机处理</span>
      <span className="dot-sep" aria-hidden="true"/>
      <span>照片不上传</span>
    </p>
    <div className="topbar-actions">
      <PrivacyNotes/>
      <ThemeSwitch/>
    </div>
  </header>;
}

// Not <dialog> (Safari 15.4) and not the Popover API (Safari 17): a plain
// anchored panel that covers the layout instead of pushing it.
function PrivacyNotes() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    function close() {
      setOpen(false);
      trigger.current?.focus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    function onPointerDown(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) close();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return <div className="popover-anchor" ref={anchor}>
    <button ref={trigger} type="button" className="button ghost" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
      <ShieldCheck size={15}/>隐私须知
    </button>
    {open && <div ref={panel} className="popover" role="dialog" aria-labelledby="privacy-title" tabIndex={-1}>
      <h2 id="privacy-title">隐私与使用须知</h2>
      <ul className="privacy-list">{PRIVACY_POINTS.map(point => <li key={point}>{point}</li>)}</ul>
      <p className="privacy-foot">一份明确的用途声明，不是绝对的安全保证。</p>
    </div>}
  </div>;
}