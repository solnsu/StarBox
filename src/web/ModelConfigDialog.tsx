import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, RefreshCw, X } from 'lucide-react';
import { ApiError, gatewayApi, modelsApi, type ClientConfiguration } from './api';
import { errorKey, useI18n } from './i18n';
import { SolnSpin } from './SolnSpin';
import { MotionPresence } from './MotionPresence';
import type { AvailableModel, Notice } from './types';

type Notify = (message: string, type?: Notice['type']) => void;

export function ModelConfigDialog({ model, notify, onClose }: {
  model: AvailableModel;
  notify: Notify;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [config, setConfig] = useState<ClientConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmingRotation, setConfirmingRotation] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await modelsApi.clientConfig(model.id));
    } catch (error) {
      notify(t(errorKey(error instanceof ApiError ? error.code : '')), 'error');
    } finally {
      setLoading(false);
    }
  }, [model.id, notify, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
  }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmingRotation) setConfirmingRotation(false);
      else onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [confirmingRotation, onClose]);

  const copy = async (content: string, target: string) => {
    try {
      await navigator.clipboard.writeText(content);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      setCopiedTarget(target);
      copiedTimer.current = window.setTimeout(() => {
        setCopiedTarget(null);
        copiedTimer.current = null;
      }, 1800);
      notify(t('copied'));
    } catch {
      notify(t('errorGeneric'), 'error');
    }
  };

  const rotate = async () => {
    setConfirmingRotation(false);
    setRotating(true);
    try {
      await gatewayApi.rotateKey();
      const next = await modelsApi.clientConfig(model.id);
      setConfig(next);
      notify(t('apiKeyRotated'));
    } catch (error) {
      notify(t(errorKey(error instanceof ApiError ? error.code : '')), 'error');
    } finally {
      setRotating(false);
    }
  };

  const applyToCodex = async () => {
    setApplying(true);
    try {
      await modelsApi.applyToCodex(model.id);
      notify(t('codexApplied'));
    } catch (error) {
      notify(t(errorKey(error instanceof ApiError ? error.code : '')), 'error');
    } finally {
      setApplying(false);
    }
  };

  return <div className="model-config-layer" role="dialog" aria-modal="true" aria-label={t('modelConfigTitle')}>
    <button className="model-config-backdrop" aria-label={t('close')} onClick={onClose} />
    <section className="model-config-dialog">
      <header className="model-config-header">
        <div className="model-config-title-row">
          <h3>{t('useModel', { model: model.displayName })}</h3>
          {config?.kind === 'codex' && <button className="model-config-apply-codex" type="button" onClick={() => void applyToCodex()} disabled={applying || loading} aria-label={t('applyToCodex')} title={t('applyToCodex')}>
            <CodexMark />
            <span>{applying ? t('applying') : t('applyToCodex')}</span>
          </button>}
        </div>
        <button className="model-config-close" aria-label={t('close')} onClick={onClose}><X size={21} /></button>
      </header>
      {loading ? <div className="model-config-loading"><SolnSpin label={t('loading')} /></div> : config ? <div className="model-config-content cp-sidebar-scrollbar">
        <section className="model-config-secret">
          <div className="model-config-section-title"><div><span>{t('apiKey')}</span></div><button onClick={() => setConfirmingRotation(true)} disabled={rotating}><RefreshCw className={rotating ? 'spin' : ''} size={14} />{t('rotateKey')}</button></div>
          <div className="model-config-copy-row"><code>{config.apiKey}</code><button className={copiedTarget === 'api-key' ? 'copied' : ''} aria-label={copiedTarget === 'api-key' ? t('copied') : t('copy')} title={copiedTarget === 'api-key' ? t('copied') : t('copy')} onClick={() => void copy(config.apiKey, 'api-key')}>{copiedTarget === 'api-key' ? <Check size={16} strokeWidth={2.5} /> : <Copy size={15} />}</button></div>
        </section>
        <section className="model-config-endpoint">
          <span>{t('localApiEndpoint')}</span>
          <div className="model-config-copy-row"><code>{config.endpoint}</code><button className={copiedTarget === 'endpoint' ? 'copied' : ''} aria-label={copiedTarget === 'endpoint' ? t('copied') : t('copy')} title={copiedTarget === 'endpoint' ? t('copied') : t('copy')} onClick={() => void copy(config.endpoint, 'endpoint')}>{copiedTarget === 'endpoint' ? <Check size={16} strokeWidth={2.5} /> : <Copy size={15} />}</button></div>
        </section>
        <div className="model-config-files">
          <ConfigFile name="auth.json" content={config.authJson} compact copied={copiedTarget === 'file:auth.json'} onCopy={(content) => copy(content, 'file:auth.json')} />
          <ConfigFile name={config.secondaryFileName} content={config.secondaryContent} copied={copiedTarget === `file:${config.secondaryFileName}`} onCopy={(content) => copy(content, `file:${config.secondaryFileName}`)} />
        </div>
      </div> : <div className="model-config-loading"><button className="model-config-retry" onClick={() => void load()}>{t('refresh')}</button></div>}
      <MotionPresence>{confirmingRotation ? <div className="model-key-confirm-layer" role="alertdialog" aria-modal="true" aria-label={t('rotateKeyTitle')}>
        <button className="model-key-confirm-backdrop" aria-label={t('cancel')} onClick={() => setConfirmingRotation(false)} />
        <section className="model-key-confirm">
          <h4>{t('rotateKeyTitle')}</h4>
          <p>{t('rotateKeyBody')}</p>
          <footer><button onClick={() => setConfirmingRotation(false)}>{t('cancel')}</button><button className="confirm" onClick={() => void rotate()}>{t('confirmRotate')}</button></footer>
        </section>
      </div> : null}</MotionPresence>
    </section>
  </div>;
}

function CodexMark() {
  return <svg className="codex-mark" fill="#fff" fillRule="evenodd" style={{ flex: 'none', lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <title>Codex</title>
    <path clipRule="evenodd" d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z" />
  </svg>;
}

function ConfigFile({ name, content, compact = false, copied, onCopy }: {
  name: string;
  content: string;
  compact?: boolean;
  copied: boolean;
  onCopy: (content: string) => Promise<void>;
}) {
  const { t } = useI18n();
  return <section className={`model-config-file${compact ? ' compact' : ''}${name === 'request.json' ? ' image-request' : ''}`}>
    <strong className="model-config-file-name">{name}</strong>
    <div className="model-config-code-wrap">
      <pre className="model-config-code cp-sidebar-scrollbar"><code>{content}</code></pre>
      <button className={`model-config-code-copy${copied ? ' copied' : ''}`} aria-label={copied ? t('copied') : t('copy')} title={copied ? t('copied') : t('copy')} onClick={() => void onCopy(content)}>{copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={14} />}</button>
    </div>
  </section>;
}
