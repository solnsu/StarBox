import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useI18n } from './i18n';

export function DesktopTitlebar() {
  const controls = window.desktopWindowControls;
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!controls || controls.platform !== 'win32') return undefined;
    let active = true;
    void controls.isMaximized().then((value) => { if (active) setMaximized(value); });
    const unsubscribe = controls.onMaximizedChange(setMaximized);
    return () => { active = false; unsubscribe(); };
  }, [controls]);

  if (!controls) return null;
  const windows = controls.platform === 'win32';
  return <header className={`desktop-titlebar${windows ? ' windows' : ''}`} onDoubleClick={(event) => { if (windows && !(event.target as HTMLElement).closest('button')) controls.toggleMaximize(); }}>
    {windows ? <>
      <div className="desktop-titlebar-brand"><img src="/favicon.png" alt="" /><span>{t('appName')}</span></div>
      <div className="desktop-window-actions">
        <button type="button" aria-label={t('minimize')} title={t('minimize')} onClick={controls.minimize}><Minus /></button>
        <button type="button" aria-label={maximized ? t('restore') : t('maximize')} title={maximized ? t('restore') : t('maximize')} onClick={controls.toggleMaximize}>{maximized ? <Copy /> : <Square />}</button>
        <button className="close" type="button" aria-label={t('close')} title={t('close')} onClick={controls.close}><X /></button>
      </div>
    </> : null}
  </header>;
}
