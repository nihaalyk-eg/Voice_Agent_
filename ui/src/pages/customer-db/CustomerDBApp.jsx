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

  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(true);
  const [workOrdersError, setWorkOrdersError] = useState('');

  const [transcripts, setTranscripts] = useState([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(true);

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

  const loadWorkOrders = useCallback(async () => {
    setWorkOrdersLoading(true);
    try {
      const res = await authFetch('/work-orders');
      const data = await res.json();
      if (data.error) {
        setWorkOrdersError(data.error);
        setWorkOrders([]);
      } else {
        setWorkOrdersError('');
        setWorkOrders(data.work_orders || []);
      }
    } catch (e) {
      setWorkOrdersError(e.message);
      setWorkOrders([]);
    } finally {
      setWorkOrdersLoading(false);
    }
  }, [authFetch]);

  const loadTranscripts = useCallback(async () => {
    setTranscriptsLoading(true);
    try {
      const res = await authFetch('/transcripts');
      const data = await res.json();
      setTranscripts(data.transcripts || []);
    } catch (e) {
      setTranscripts([]);
    } finally {
      setTranscriptsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(search), 250);
    return () => clearTimeout(t);
  }, [search, loadCustomers]);

  useEffect(() => {
    loadWorkOrders();
    loadTranscripts();
  }, [loadWorkOrders, loadTranscripts]);

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
      if (typeof line === 'string' && (line.includes('create_work_order') || line.includes('Work Order'))) {
        loadWorkOrders();
      }
    };

    es.onerror = () => {
      sseTimerRef.current = setTimeout(() => initStream(tok), 5000);
    };
  }, [loadWorkOrders]);

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
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>Customer DB & Activity Center</span>
        </div>

        {/* WORK ORDERS CARD */}
        <div className="erp-card" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 className="erp-card-title" style={{ marginBottom: 0 }}>
              <i className="fa-solid fa-clipboard-list"></i> Created Work Orders {!workOrdersLoading && `(${workOrders.length})`}
            </h3>
            <button type="button" onClick={loadWorkOrders} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              <i className="fa-solid fa-rotate-right" style={{ marginRight: '4px' }}></i>Refresh
            </button>
          </div>
          {workOrdersError && (
            <div style={{ fontSize: '11.5px', color: 'var(--red-glow)', padding: '10px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: '10px' }}>
              {workOrdersError}
            </div>
          )}
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['ID', 'Property Address', 'Apt', 'Issue Description', 'Caller Phone', 'Urgency', 'Status', 'Created At'].map(h => (
                    <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', color: 'var(--text-muted)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workOrdersLoading && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>Loading work orders…</td></tr>
                )}
                {!workOrdersLoading && !workOrdersError && workOrders.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}>No work orders created yet.</td></tr>
                )}
                {workOrders.map(w => (
                  <tr key={w.id}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)', fontWeight: 600 }}>{w.id}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-primary)', fontWeight: 500 }}>{w.property_address}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{w.apartment_number || '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)', maxWidth: '240px' }}>{w.issue_description}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{w.caller_phone_number || '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)' }}>
                      <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: w.urgency_level === 'Urgent' ? 'rgba(239,68,68,0.15)' : 'var(--bg-muted)', color: w.urgency_level === 'Urgent' ? 'var(--red-glow)' : 'var(--text-secondary)', fontWeight: 500 }}>
                        {w.urgency_level || 'Standard'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)' }}>
                      <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 500 }}>
                        {w.status || 'Assigned'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-muted)', fontSize: '11px' }}>
                      {w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CUSTOMERS CARD */}
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
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
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

        {/* CALL TRANSCRIPTS HISTORY CARD */}
        <div className="erp-card" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 className="erp-card-title" style={{ marginBottom: 0 }}>
              <i className="fa-solid fa-comments"></i> Previous Call Transcripts {!transcriptsLoading && `(${transcripts.length} turns)`}
            </h3>
            <button type="button" onClick={loadTranscripts} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              <i className="fa-solid fa-rotate-right" style={{ marginRight: '4px' }}></i>Refresh
            </button>
          </div>
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Agent Mode', 'Turn', 'User Spoke', 'Agent Response', 'Latency (E2E)'].map(h => (
                    <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', color: 'var(--text-muted)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transcriptsLoading && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>Loading transcripts…</td></tr>
                )}
                {!transcriptsLoading && transcripts.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}>No previous call transcripts recorded yet.</td></tr>
                )}
                {transcripts.map((t, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', fontWeight: 600, color: 'var(--text-primary)' }}>{t.agent_label}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>#{t.turn}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t.user_text || '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-primary)' }}>{t.agent_text || '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)' }}>{t.e2e_ms ? `${Math.round(t.e2e_ms)} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* LIVE LOGS */}
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
