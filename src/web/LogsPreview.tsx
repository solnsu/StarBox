import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CheckCircle2, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CircleDollarSign,
  Database, RefreshCw, Search, X, XCircle,
} from 'lucide-react';
import { ApiError, gatewayApi } from './api';
import { errorKey, useI18n } from './i18n';
import type { Notice, RequestLog, RequestLogSummary } from './types';
import { SolnSpin } from './SolnSpin';
import { MotionPresence } from './MotionPresence';
import { CustomSelect } from './CustomSelect';

type LogStatus = 'all' | 'success' | 'failed';
type Notify = (message: string, type?: Notice['type']) => void;

const emptySummary: RequestLogSummary = {
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  estimatedCostUsd: 0,
  averageLatencyMs: null,
  lastRequestAt: null,
};

export function LogsPreview({ notify }: { notify: Notify }) {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [summary, setSummary] = useState<RequestLogSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<LogStatus>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSettledQuery(query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const startAt = useMemo(() => dateBoundary(startDate), [startDate]);
  const endAt = useMemo(() => dateBoundary(endDate, true), [endDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gatewayApi.logs({ query: settledQuery, status, startAt, endAt, limit: pageSize, offset: page * pageSize });
      setLogs(result.logs);
      setSummary(result.summary);
    } catch (error) {
      notify(t(errorKey(error instanceof ApiError ? error.code : '')), 'error');
    } finally {
      setLoading(false);
    }
  }, [endAt, notify, page, pageSize, settledQuery, startAt, status, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); }, [endAt, pageSize, settledQuery, startAt, status]);

  const pageCount = Math.max(1, Math.ceil(summary.totalRequests / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  useEffect(() => { if (page !== safePage) setPage(safePage); }, [page, safePage]);
  const firstRow = logs.length ? safePage * pageSize + 1 : 0;
  const lastRow = logs.length ? safePage * pageSize + logs.length : 0;

  return <main className="logs-canvas">
    <section className="logs-shell">
      <section className="logs-summary" aria-label={t('logSummary')}>
        <SummaryItem icon={<Database />} label={t('totalRequests')} value={formatNumber(summary.totalRequests, locale)} onValueClick={notify} />
        <SummaryItem icon={<CheckCircle2 />} label={t('successRequests')} value={formatNumber(summary.successCount, locale)} tone="success" onValueClick={notify} />
        <SummaryItem icon={<XCircle />} label={t('failedRequests')} value={formatNumber(summary.failureCount, locale)} tone="failed" onValueClick={notify} />
        <SummaryItem icon={<CircleDollarSign />} label={t('estimatedCost')} value={formatCurrency(summary.estimatedCostUsd ?? 0)} tone="cost" onValueClick={notify} />
      </section>

      <section className="logs-table-card">
        <div className="logs-toolbar">
          <div className="logs-toolbar-query">
            <label className="logs-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('logSearchPlaceholder')} /></label>
            <DateRangePicker startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
          </div>
          <div className="logs-toolbar-actions"><div className="logs-filters" role="group" aria-label={t('status')}>
            {(['all', 'success', 'failed'] as const).map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{item === 'all' ? t('allRequests') : t(item)}</button>)}
          </div><button className="logs-refresh" onClick={() => void load()} disabled={loading} aria-label={t('refreshLogs')} title={t('refreshLogs')}><RefreshCw size={17} /></button></div>
        </div>

        <div className="logs-table-scroll cp-sidebar-scrollbar">
          {loading ? <LoadingState /> : logs.length ? <table className="logs-table">
            <thead><tr><th>{t('request')}</th><th>{t('model')}</th><th>{t('account')}</th><th>{t('requestPath')}</th><th>{t('tokenUsage')}</th><th>{t('estimatedCost')}</th><th>{t('latency')}</th><th>{t('status')}</th></tr></thead>
            <tbody>{logs.map((log) => <tr key={log.id}>
              <td><strong>{formatDateTime(log.timestampMs, locale)}</strong></td>
              <td><strong>{log.model ?? '—'}</strong></td>
              <td><strong>{log.accountSnapshot ?? '—'}</strong></td>
              <td><span className="logs-endpoint"><b>{log.method ?? 'API'}</b>{log.path ?? log.endpoint ?? '—'}</span></td>
              <td><TokenSummary log={log} locale={locale} /></td>
              <td><strong className="logs-cost">{formatCurrency(log.estimatedCostUsd ?? 0)}</strong></td>
              <td><div className="logs-latency">
                <span><small>{t('firstByte')}</small><strong>{formatDuration(log.ttftMs)}</strong></span>
                <span><small>{t('elapsedShort')}</small><strong>{formatDuration(log.latencyMs)}</strong></span>
              </div></td>
              <td><StatusBadge log={log} onClick={log.failed ? () => setSelectedLog(log) : undefined} /></td>
            </tr>)}</tbody>
          </table> : <div className="logs-empty"><strong>{t('noLogs')}</strong></div>}
        </div>

        <footer className="logs-pagination">
          <span>{t('showingRows', { first: firstRow, last: lastRow, total: summary.totalRequests })}</span>
          <div className="logs-page-size"><span>{t('rowsPerPage')}</span><CustomSelect className="logs-page-select" value={String(pageSize)} ariaLabel={t('rowsPerPage')} menuPlacement="top" minMenuWidth={76} options={[{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '50', label: '50' }]} onChange={(value) => setPageSize(Number(value))} /></div>
          <strong>{t('pageOf', { page: safePage + 1, total: pageCount })}</strong>
          <div className="logs-page-actions">
            <PageButton label={t('firstPage')} disabled={safePage === 0} onClick={() => setPage(0)}><ChevronFirst size={16} /></PageButton>
            <PageButton label={t('previousPage')} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16} /></PageButton>
            <PageButton label={t('nextPage')} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}><ChevronRight size={16} /></PageButton>
            <PageButton label={t('lastPage')} disabled={safePage >= pageCount - 1} onClick={() => setPage(pageCount - 1)}><ChevronLast size={16} /></PageButton>
          </div>
        </footer>
      </section>
    </section>
    <MotionPresence>{selectedLog ? <LogStatusDialog log={selectedLog} onClose={() => setSelectedLog(null)} /> : null}</MotionPresence>
  </main>;
}

function SummaryItem({ icon, label, value, tone = '', onValueClick }: { icon: React.ReactNode; label: string; value: string; tone?: string; onValueClick: (value: string) => void }) {
  return <article className={`logs-summary-item ${tone}`}><span>{icon}</span><div><small>{label}</small><button className="logs-summary-value" type="button" onClick={() => onValueClick(value)}>{value}</button></div></article>;
}

function StatusBadge({ log, onClick }: { log: RequestLog; onClick?: () => void }) {
  const { t } = useI18n();
  const content = <><i />{log.failed ? t('failed') : t('success')}</>;
  return onClick
    ? <button className={`logs-status ${log.failed ? 'failed' : 'success'}`} onClick={(event) => { event.stopPropagation(); onClick(); }}>{content}</button>
    : <span className={`logs-status ${log.failed ? 'failed' : 'success'}`}>{content}</span>;
}

function PageButton({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return <button aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

function LoadingState() {
  const { t } = useI18n();
  return <div className="logs-loading"><SolnSpin label={t('loading')} /></div>;
}

function DateRangePicker({ startDate, endDate, onChange }: {
  startDate: string; endDate: string; onChange: (start: string, end: string) => void;
}) {
  const { t, locale } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(parseDate(endDate || startDate) ?? new Date()));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    month: 'short', day: 'numeric',
  }), [locale]);
  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric', month: 'long',
  }), [locale]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(
    locale === 'zh' ? 'zh-CN' : 'en', { weekday: 'narrow' },
  ).format(new Date(2024, 0, 7 + index))), [locale]);
  const label = startDate
    ? `${formatter.format(parseDate(startDate)!)}${endDate ? ` — ${formatter.format(parseDate(endDate)!)}` : ''}`
    : t('requestTimeRange');

  const selectDate = (date: Date) => {
    const value = toDateValue(date);
    if (date.getMonth() !== visibleMonth.getMonth()) setVisibleMonth(monthStart(date));
    if (!startDate || endDate) {
      onChange(value, '');
      return;
    }
    if (value < startDate) onChange(value, startDate);
    else onChange(startDate, value);
  };

  return <div ref={rootRef} className={`logs-date-picker ${open ? 'open' : ''}`}>
    <div className={`logs-date-control ${startDate || endDate ? 'has-value' : ''}`}>
      <button className="logs-date-trigger" type="button" aria-expanded={open} onClick={() => {
        setVisibleMonth(monthStart(parseDate(endDate || startDate) ?? new Date()));
        setOpen((value) => !value);
      }}>
        <CalendarDays size={15} /><span className={startDate ? '' : 'placeholder'}>{label}</span>
        <ChevronDown className="logs-date-chevron" size={14} />
      </button>
      {(startDate || endDate) && <button className="logs-date-clear" type="button" aria-label={t('clearTimeRange')} title={t('clearTimeRange')} onClick={() => onChange('', '')}><X size={13} /></button>}
    </div>
    <MotionPresence>{open ? <section className="logs-calendar-card" aria-label={t('requestTimeRange')}>
      <header>
        <strong>{monthFormatter.format(visibleMonth)}</strong>
        <div>
          <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} aria-label={t('previousMonth')}><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} aria-label={t('nextMonth')}><ChevronRight size={16} /></button>
        </div>
      </header>
      <div className="logs-calendar-weekdays">{weekdays.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}</div>
      <div className="logs-calendar-grid">{days.map((date) => {
        const value = toDateValue(date);
        const selected = value === startDate || value === endDate;
        const inRange = Boolean(startDate && endDate && value > startDate && value < endDate);
        const outside = date.getMonth() !== visibleMonth.getMonth();
        return <button key={value} type="button" className={`${selected ? 'selected' : ''} ${inRange ? 'in-range' : ''} ${outside ? 'outside' : ''}`} aria-pressed={selected} onClick={() => selectDate(date)}><span>{date.getDate()}</span></button>;
      })}</div>
    </section> : null}</MotionPresence>
  </div>;
}

function LogStatusDialog({ log, onClose }: { log: RequestLog; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  return <div className="logs-status-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="log-status-title">
    <button className="logs-status-dialog-backdrop" aria-label={t('close')} onClick={onClose} />
    <section className="logs-status-dialog">
      <header><h2 id="log-status-title">{t('callDetails')}</h2><span className="logs-status-text failed">{t('failed')}</span><button className="logs-status-dialog-close" onClick={onClose} aria-label={t('close')}><X size={19} /></button></header>
      <pre className="logs-status-message cp-sidebar-scrollbar"><code>{log.failSummary ?? t('noResponseContent')}</code></pre>
    </section>
  </div>;
}

function TokenSummary({ log, locale }: { log: RequestLog; locale: string }) {
  const { t } = useI18n();
  return <div className="logs-token-summary">
    <span><small>{t('inputShort')}:</small><strong>{formatNumber(log.inputTokens, locale)}</strong></span>
    <span><small>{t('outputShort')}:</small><strong>{formatNumber(log.outputTokens, locale)}</strong></span>
    <span><small>{t('cacheHit')}:</small><strong>{formatNumber(log.cachedTokens, locale)}</strong></span>
    <span><small>{t('thinking')}:</small><strong>{formatNumber(log.reasoningTokens, locale)}</strong></span>
  </div>;
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en').format(value);
}

function formatDateTime(value: number, locale: string, seconds = false) {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    ...(seconds ? { second: '2-digit' as const } : {}),
  }).format(value);
}

function formatDuration(value: number | null) {
  if (value === null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s` : `${value} ms`;
}

function formatCurrency(value: number) {
  return `$${value.toFixed(6)}`;
}

function dateBoundary(value: string, nextDay = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.getTime();
}

function parseDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return null;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}
