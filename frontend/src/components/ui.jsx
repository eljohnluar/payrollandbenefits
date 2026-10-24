import { useState, useEffect, useRef } from 'react';
import { money } from '../lib/format.js';

export { money };

export function statusBadge(status) {
  return (
    {
      Paid: 'badge-success', Approved: 'badge-success', Released: 'badge-success', Closed: 'badge-success',
      Active: 'badge-success', Completed: 'badge-success',
      Draft: 'badge-warning', Pending: 'badge-warning', 'Pending Finance Approval': 'badge-warning',
      Rejected: 'badge-danger', Resigned: 'badge-danger', Terminated: 'badge-danger', Cancelled: 'badge-danger',
      Failed: 'badge-danger', 'On Hold': 'badge-danger',
      Submitted: 'badge-info', Processing: 'badge-info', Enrolled: 'badge-info',
    }[status] || 'badge-muted'
  );
}

export function Badge({ children }) {
  const cls = statusBadge(children);
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, kind = 'neutral' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-change ${kind}`}>{sub}</div>}
    </div>
  );
}

export function StatsGrid({ children }) {
  return <div className="stats-grid">{children}</div>;
}

export function Card({ title, right, children, body }) {
  return (
    <div className="card">
      {(title || right) && (
        <div className="card-header">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      {body ? <div className="card-body">{children}</div> : children}
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  void text;
  return (
    <div className="skel-page" aria-busy="true" aria-label="Loading content">
      <div className="skel skel-title" />
      <div className="stats-grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel skel-stat" />)}
      </div>
      <div className="skel skel-card" />
      <div className="skel skel-card skel-card-sm" />
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert error">{error}</div>;
}

export function Notice({ children, kind = 'info' }) {
  if (!children) return null;
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function TablePagination({
  page = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const pages = [];
  const maxButtons = 5;
  if (totalPages <= maxButtons) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    let startPage = Math.max(1, page - 1);
    let endPage = Math.min(totalPages, page + 1);

    if (page <= 2) {
      startPage = 1;
      endPage = 3;
    } else if (page >= totalPages - 1) {
      startPage = totalPages - 2;
      endPage = totalPages;
    }

    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) pages.push('ellipsis-start');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push('ellipsis-end');
      pages.push(totalPages);
    }
  }

  return (
    <div className="table-pagination">
      <div className="table-pagination-info">
        Showing <strong>{start}–{end}</strong> of <strong>{totalItems}</strong> entries
        <span className="table-pagination-page-count"> · Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
      </div>
      <div className="table-pagination-controls">
        <button
          type="button"
          className="btn btn-sm btn-secondary pagination-btn pagination-prev-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ‹ Previous
        </button>
        <div className="table-pagination-pages">
          {pages.map((p, idx) => {
            if (typeof p === 'string') {
              return <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>;
            }
            return (
              <button
                key={p}
                type="button"
                className={`pagination-page-btn ${page === p ? 'active' : ''}`}
                onClick={() => onPageChange(p)}
                aria-current={page === p ? 'page' : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary pagination-btn pagination-next-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next Page ›
        </button>
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  loading,
  error,
  empty = 'No records yet.',
  foot,
  pageSize = 10,
  page: controlledPage,
  onPageChange: controlledOnPageChange,
}) {
  const [internalPage, setInternalPage] = useState(1);
  const isControlled = controlledPage !== undefined;
  const page = isControlled ? controlledPage : internalPage;
  const setPage = isControlled ? (controlledOnPageChange || (() => {})) : setInternalPage;

  const totalRows = rows ? rows.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);

  // Sync internal page if totalPages shrinks below current page
  useEffect(() => {
    if (!isControlled && page > totalPages) {
      setInternalPage(totalPages);
    }
  }, [isControlled, page, totalPages]);

  // Reset to first page when total count changes
  const prevCountRef = useRef(totalRows);
  useEffect(() => {
    if (prevCountRef.current !== totalRows) {
      prevCountRef.current = totalRows;
      if (!isControlled) {
        setInternalPage(1);
      }
    }
  }, [totalRows, isControlled]);

  const pagedRows = totalRows > pageSize
    ? rows.slice((validPage - 1) * pageSize, validPage * pageSize)
    : (rows || []);

  const head = (
    <thead>
      <tr>
        {columns.map((c) => (
          <th key={c.key} className={c.align === 'right' ? 'num' : undefined}>{c.label}</th>
        ))}
      </tr>
    </thead>
  );
  if (loading) {
    return (
      <div className="table-wrap" aria-busy="true" aria-label="Loading table">
        <table>
          {head}
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <tr key={r}>
                {columns.map((c, ci) => (
                  <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>
                    <span className="skel skel-cell" style={{ width: `${45 + ((r * 23 + ci * 17) % 50)}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="data-table-container">
      <div className="table-wrap">
        <table>
          {head}
          <tbody>
            {pagedRows && pagedRows.length > 0 ? (
              pagedRows.map((row, i) => (
                <tr key={row.id ?? (validPage - 1) * pageSize + i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>
                      {c.render ? c.render(row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>{empty}</td>
              </tr>
            )}
          </tbody>
          {foot && rows && rows.length > 0 && (
            <tfoot>
              <tr>
                {foot.map((cell, i) => (
                  <td key={i} className={columns[i]?.align === 'right' ? 'num' : undefined}>{cell}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TablePagination
        page={validPage}
        totalItems={totalRows}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000, overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: wide ? 720 : 480, boxShadow: '0 20px 60px rgba(17,24,39,.25)' }}
      >
        <div className="card-header">
          <h2>{title}</h2>
          <button className="btn ghost" style={{ padding: '4px 9px' }} onClick={onClose}>Close</button>
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

const HR_SOURCE_COLORS = {
  HR1: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#2563eb' },
  HR2: { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490', dot: '#0891b2' },
  HR3: { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9', dot: '#7c3aed' },
};

export function IntegrationSourceTag({ systems, label }) {
  // systems: array like ['HR1'] or ['HR2', 'HR3']
  // label: optional override text
  if (!systems || !systems.length) return null;
  const colors = systems.length === 1 ? HR_SOURCE_COLORS[systems[0]] : { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', dot: '#94a3b8' };
  const text = label || (systems.length === 1 ? `Synced from ${systems[0]}` : `Data from ${systems.join(' · ')}`);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      letterSpacing: 0.2,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.dot, display: 'inline-block' }} />
      {text}
    </span>
  );
}

export function IntegrationSourceBanner({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: 'var(--surface-alt, #f8fafc)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)',
      marginBottom: 16,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1, opacity: 0.6 }}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

