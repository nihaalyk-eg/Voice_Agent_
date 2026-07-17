import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';

const S = {
  select: {
    width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)',
    border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '12px', outline: 'none', fontFamily: 'inherit',
  },
};

const MAX_LOG_LINES = 500;

export const CustomerDBApp = () => {
  const { token, authFetch } = useAuth();
  const [logs, setLogs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState('');
  const [search, setSearch] = useState('');

  const sseRef = useRef(null);
  const sseTimerRef = useRef(null);
  const logsEndRef = useRef(null);

  const loadCustomers = useCallback(async (q) => {
    setCustomersLoading(true);
    try {
      const res = await authFetch(`/customers?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error) {
        setCustomersError(data.error);
        setCustomers([]);
      } else {
        setCustomersError('');
        setCustomers(data.customers || []);
      }
    } catch (e) {
      setCustomersError(e.message);
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(search), 250);
    return () => clearTimeout(t);
  }, [search, loadCustomers]);

  const initStream = useCallback((tok) => {
    if (sseRef.current) sseRef.current.close();
    if (sseTimerRef.current) { clearTimeout(sseTimerRef.current); sseTimerRef.current = null; }

    const es = new EventSource(`/stream?token=${encodeURIComponent(tok)}`);
    sseRef.current = es;

    es.onmessage = (e) => {
      let line;
      try { line = JSON.parse(e.data); } catch { return; }
      if (line === '__STOPPED__') return;
      setLogs(prev => [...prev.slice(-(MAX_LOG_LINES - 1)), String(line)]);
    };

    es.onerror = () => {
      sseTimerRef.current = setTimeout(() => initStream(tok), 5000);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    initStream(token);
    return () => {
      if (sseRef.current) sseRef.current.close();
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
    };
  }, [token, initStream]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [logs]);

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="page-main customerdb-page-main" style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="page-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--violet-glow)', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>Customer DB</span>
        </div>

        <div className="erp-card" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '12px', flexWrap: 'wrap' }}>
            <h3 className="erp-card-title" style={{ marginBottom: 0 }}><i className="fa-solid fa-address-book"></i> Customers {!customersLoading && `(${customers.length})`}</h3>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, or address…"
              style={{ ...S.select, cursor: 'text', width: '260px' }}
            />
          </div>
          {customersError && (
            <div style={{ fontSize: '11.5px', color: 'var(--red-glow)', padding: '10px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: '10px' }}>
              {customersError}
            </div>
          )}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Name', 'Phone', 'Address', 'Language', 'Notes'].map(h => (
                    <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', color: 'var(--text-muted)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customersLoading && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>Loading…</td></tr>
                )}
                {!customersLoading && !customersError && customers.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}>No customers found.</td></tr>
                )}
                {customers.map(c => (
                  <tr key={c.id}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-primary)', fontWeight: 500 }}>{c.full_name}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{c.phone_number}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{c.property_address}{c.apartment_number ? `, Apt ${c.apartment_number}` : ''}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{c.language_preference}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-muted)', fontStyle: 'italic' }}>{c.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="erp-card" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 className="erp-card-title" style={{ marginBottom: 0 }}><i className="fa-solid fa-terminal"></i> Live Logs</h3>
            <button type="button" onClick={() => setLogs([])} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Clear</button>
          </div>
          <div style={{ height: '220px', overflowY: 'auto', background: 'var(--bg-muted)', borderRadius: '8px', padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', lineHeight: 1.6 }}>
            {logs.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No logs yet — start a Customer DB call to see activity here.</div>}
            {logs.map((line, i) => <div key={i} style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line}</div>)}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
