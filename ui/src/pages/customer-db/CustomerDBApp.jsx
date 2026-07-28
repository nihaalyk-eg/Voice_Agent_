import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';
import { useNav } from '../../NavContext';

const S = {
  input: {
    width: '100%', background: 'var(--bg-muted)', color: 'var(--text-primary)',
    border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  btnPrimary: {
    background: 'var(--violet-glow)', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s',
  },
  btnSecondary: {
    background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-light)',
    borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s',
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(5px)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px',
  },
  modalCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '14px',
    width: '100%', maxWidth: '640px', maxHeight: '85vh', padding: '24px', boxShadow: '0 25px 30px -5px rgba(0, 0, 0, 0.6)',
    display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--text-primary)',
  },
};

export const CustomerDBApp = ({ activeTab = 'customers' }) => {
  const { authFetch } = useAuth();
  const { navigate } = useNav();

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(true);
  const [workOrdersError, setWorkOrdersError] = useState('');
  const [workOrderSearch, setWorkOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showCreateWOModal, setShowCreateWOModal] = useState(false);
  const [selectedWO, setSelectedWO] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(true);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);

  const currentTab = ['customers', 'customer-db', 'work-orders', 'transcripts'].includes(activeTab)
    ? (activeTab === 'customer-db' ? 'customers' : activeTab)
    : 'customers';

  // Sync currentTab from URL as well (for direct navigation/refresh)
  const urlTab = (() => {
    const p = window.location.pathname;
    if (p.includes('/voice/work-orders')) return 'work-orders';
    if (p.includes('/voice/transcripts')) return 'transcripts';
    return 'customers';
  })();
  const effectiveTab = urlTab !== 'customers' ? urlTab : currentTab;

  // ── FETCH CUSTOMERS ──────────────────────────────────────────────────────────
  const loadCustomers = useCallback(async (q = '') => {
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

  // ── FETCH WORK ORDERS ────────────────────────────────────────────────────────
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

  // ── FETCH CALL SESSIONS TRANSCRIPTS ──────────────────────────────────────────
  const loadTranscripts = useCallback(async () => {
    setTranscriptsLoading(true);
    try {
      const res = await authFetch('/transcripts');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      setSessions([]);
    } finally {
      setTranscriptsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(customerSearch), 250);
    return () => clearTimeout(t);
  }, [customerSearch, loadCustomers]);

  useEffect(() => {
    loadWorkOrders();
    loadTranscripts();
  }, [loadWorkOrders, loadTranscripts]);

  // ── UPDATE WORK ORDER STATUS ────────────────────────────────────────────────
  const handleUpdateStatus = async (woId, newStatus) => {
    try {
      const res = await authFetch(`/work-orders/${woId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!data.error) {
        setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, status: newStatus } : w));
        if (selectedWO?.id === woId) setSelectedWO(prev => ({ ...prev, status: newStatus }));
      }
    } catch (e) {
      alert('Failed to update status: ' + e.message);
    }
  };

  const filteredWorkOrders = workOrders.filter(w => {
    const matchesStatus = statusFilter === 'All'
      ? true
      : statusFilter === 'Urgent'
        ? w.urgency_level === 'Urgent'
        : w.status === statusFilter;
    const q = workOrderSearch.toLowerCase();
    const matchesSearch = !q || (
      w.id?.toLowerCase().includes(q) ||
      w.property_address?.toLowerCase().includes(q) ||
      w.issue_description?.toLowerCase().includes(q) ||
      w.caller_phone_number?.includes(q)
    );
    return matchesStatus && matchesSearch;
  });

  const filteredSessions = sessions.filter(s => {
    const q = transcriptSearch.toLowerCase();
    if (!q) return true;
    return (
      s.agent_label?.toLowerCase().includes(q) ||
      s.preview?.toLowerCase().includes(q) ||
      s.turns?.some(t => t.user_text?.toLowerCase().includes(q) || t.agent_text?.toLowerCase().includes(q))
    );
  });

  // Calculate Overall Metrics
  const totalCalls = sessions.length;
  const allLatencies = sessions.map(s => s.avg_e2e_ms).filter(Boolean);
  const overallAvgLat = allLatencies.length ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length) : 0;

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="page-main customerdb-page-main" style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* TOP BAR WITH SUB-TAB NAVIGATION */}
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--violet-glow)', flexShrink: 0, boxShadow: '0 0 10px var(--violet-glow)' }} />
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Admin Management Center</h2>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Customer Database & Voice Call Transcripts Control</span>
            </div>
          </div>

          {/* SUB-TABS */}
          <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-light)' }}>
            {[
              { id: 'customers', label: 'Customers', icon: 'fa-address-book', path: '/voice/customers', count: customers.length },
              { id: 'work-orders', label: 'Work Orders', icon: 'fa-clipboard-list', path: '/voice/work-orders', count: workOrders.length },
              { id: 'transcripts', label: 'Call Transcripts', icon: 'fa-comments', path: '/voice/transcripts', count: sessions.length },
            ].map(tab => {
              const isSelected = effectiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(tab.path)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none',
                    background: isSelected ? 'var(--bg-card)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: isSelected ? 600 : 400, transition: 'all 0.15s', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: '6px', boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
                  }}
                >
                  <i className={`fa-solid ${tab.icon}`} style={{ fontSize: '11px', color: isSelected ? 'var(--violet-glow)' : 'inherit' }} />
                  {tab.label}
                  {tab.count !== undefined && (
                    <span style={{
                      fontSize: '10.5px', padding: '1px 7px', borderRadius: '10px',
                      background: isSelected ? 'var(--violet-glow)' : 'rgba(148, 163, 184, 0.2)',
                      color: isSelected ? '#fff' : 'var(--text-secondary)',
                      fontWeight: 600, transition: 'all 0.15s'
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 1. CUSTOMERS SUB-TAB ───────────────────────────────────────────────── */}
        {effectiveTab === 'customers' && (
          <div className="erp-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
              <h3 className="erp-card-title" style={{ marginBottom: 0 }}>
                <i className="fa-solid fa-address-book" style={{ color: 'var(--violet-glow)', marginRight: '6px' }}></i>
                Registered Customers {!customersLoading && `(${customers.length})`}
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Search name, phone, or address…"
                  style={{ ...S.input, width: '260px' }}
                />
                <button type="button" onClick={() => setShowAddCustomerModal(true)} style={S.btnPrimary}>
                  <i className="fa-solid fa-user-plus" /> Add Customer
                </button>
              </div>
            </div>

            {customersError && (
              <div style={{ fontSize: '11.5px', color: 'var(--red-glow)', padding: '10px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: '10px' }}>
                {customersError}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-muted)' }}>
                    {['Name', 'Phone', 'Address', 'Language', 'Notes', 'Actions'].map(h => (
                      <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--bg-muted)', color: 'var(--text-muted)', textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customersLoading && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>Loading customers from PostgreSQL…</td></tr>
                  )}
                  {!customersLoading && !customersError && customers.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}>No matching customers found.</td></tr>
                  )}
                  {customers.map(c => (
                    <tr key={c.id}>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-primary)', fontWeight: 600 }}>{c.full_name}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)' }}>{c.phone_number}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{c.property_address}{c.apartment_number ? `, Apt ${c.apartment_number}` : ''}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)' }}>
                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                          {c.language_preference || 'Finnish'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: '240px' }}>{c.notes || '—'}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)' }}>
                        <button type="button" onClick={() => setSelectedCustomer(c)} style={{ ...S.btnSecondary, padding: '4px 8px', fontSize: '11px' }}>
                          <i className="fa-solid fa-eye" /> View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 2. WORK ORDERS SUB-TAB ─────────────────────────────────────────────── */}
        {effectiveTab === 'work-orders' && (
          <div className="erp-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 className="erp-card-title" style={{ marginBottom: 0 }}>
                  <i className="fa-solid fa-clipboard-list" style={{ color: 'var(--violet-glow)', marginRight: '6px' }}></i>
                  Work Orders {!workOrdersLoading && `(${filteredWorkOrders.length})`}
                </h3>

                <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-light)' }}>
                  {['All', 'Assigned', 'In Progress', 'Completed', 'Urgent'].map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      style={{
                        padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', border: 'none',
                        background: statusFilter === status ? 'var(--bg-card)' : 'transparent',
                        color: statusFilter === status ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontWeight: statusFilter === status ? 600 : 400, fontFamily: 'inherit',
                      }}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={workOrderSearch}
                  onChange={e => setWorkOrderSearch(e.target.value)}
                  placeholder="Filter address, issue, phone…"
                  style={{ ...S.input, width: '240px' }}
                />
                <button type="button" onClick={() => setShowCreateWOModal(true)} style={S.btnPrimary}>
                  <i className="fa-solid fa-plus" /> Create Work Order
                </button>
                <button type="button" onClick={loadWorkOrders} style={S.btnSecondary}>
                  <i className="fa-solid fa-rotate-right" /> Refresh
                </button>
              </div>
            </div>

            {workOrdersError && (
              <div style={{ fontSize: '11.5px', color: 'var(--red-glow)', padding: '10px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: '10px' }}>
                {workOrdersError}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-muted)' }}>
                    {['WO ID', 'Property Address', 'Apt', 'Issue Description', 'Caller Phone', 'Urgency', 'Status', 'Created At', 'Details'].map(h => (
                      <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--bg-muted)', color: 'var(--text-muted)', textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workOrdersLoading && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>Loading work orders from PostgreSQL…</td></tr>
                  )}
                  {!workOrdersLoading && !workOrdersError && filteredWorkOrders.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}>No work orders match the selected filters.</td></tr>
                  )}
                  {filteredWorkOrders.map(w => (
                    <tr key={w.id}>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)', fontWeight: 700 }}>{w.id}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-primary)', fontWeight: 500 }}>{w.property_address}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{w.apartment_number || '—'}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.issue_description}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{w.caller_phone_number || '—'}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)' }}>
                        <span style={{ fontSize: '10.5px', padding: '3px 8px', borderRadius: '4px', background: w.urgency_level === 'Urgent' ? 'rgba(239,68,68,0.15)' : 'var(--bg-muted)', color: w.urgency_level === 'Urgent' ? 'var(--red-glow)' : 'var(--text-secondary)', fontWeight: 600, border: w.urgency_level === 'Urgent' ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border-light)' }}>
                          {w.urgency_level || 'Standard'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)' }}>
                        <select
                          value={w.status || 'Assigned'}
                          onChange={e => handleUpdateStatus(w.id, e.target.value)}
                          style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                        >
                          <option value="Assigned">Assigned</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-muted)', fontSize: '11px' }}>
                        {w.created_at ? new Date(w.created_at).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-muted)' }}>
                        <button type="button" onClick={() => setSelectedWO(w)} style={{ ...S.btnSecondary, padding: '4px 8px', fontSize: '11px' }}>
                          <i className="fa-solid fa-arrow-right" /> Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 3. CALL TRANSCRIPTS PER CALL SUB-TAB ───────────────────────────────── */}
        {effectiveTab === 'transcripts' && (
          <div className="erp-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* OVERALL CALL METRICS BAR */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <div style={{ background: 'var(--bg-muted)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL CALL SESSIONS</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{totalCalls}</div>
              </div>
              <div style={{ background: 'var(--bg-muted)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>AVG CALL E2E LATENCY</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--violet-glow)', marginTop: '2px' }}>{overallAvgLat} ms</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <h3 className="erp-card-title" style={{ marginBottom: 0 }}>
                <i className="fa-solid fa-phone-volume" style={{ color: 'var(--violet-glow)', marginRight: '6px' }}></i>
                Call Sessions History {!transcriptsLoading && `(${filteredSessions.length} Calls)`}
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={e => setTranscriptSearch(e.target.value)}
                  placeholder="Filter call agent mode, speech preview…"
                  style={{ ...S.input, width: '260px' }}
                />
                <button type="button" onClick={loadTranscripts} style={S.btnSecondary}>
                  <i className="fa-solid fa-rotate-right" /> Refresh
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-muted)' }}>
                    {['Call ID', 'Agent Mode', 'Total Turns', 'Initial Speech Preview', 'Avg E2E Latency', 'Action'].map(h => (
                      <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--bg-muted)', color: 'var(--text-muted)', textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transcriptsLoading && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>Loading call transcripts…</td></tr>
                  )}
                  {!transcriptsLoading && filteredSessions.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}>No recorded call sessions found.</td></tr>
                  )}
                  {filteredSessions.map((session, idx) => (
                    <tr key={session.id || idx} style={{ cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedSession(session)}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)', fontWeight: 700 }}>
                        <i className="fa-solid fa-phone" style={{ fontSize: '10px', marginRight: '6px' }} />
                        Call #{filteredSessions.length - idx}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-muted)', fontWeight: 600, color: 'var(--text-primary)' }}>{session.agent_label}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-muted)' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '11px', border: '1px solid var(--border-light)' }}>
                          {session.total_turns} turns
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        "{session.preview}"
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', background: (session.avg_e2e_ms && session.avg_e2e_ms < 1000) ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)', color: (session.avg_e2e_ms && session.avg_e2e_ms < 1000) ? '#22c55e' : '#eab308', fontWeight: 600 }}>
                          {session.avg_e2e_ms ? `${session.avg_e2e_ms} ms` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-muted)' }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedSession(session); }} style={{ ...S.btnPrimary, padding: '4px 10px', fontSize: '11px' }}>
                          <i className="fa-solid fa-expand" /> View Full Transcript
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────────── */}

      {/* 1. ADD CUSTOMER MODAL */}
      {showAddCustomerModal && (
        <ModalAddCustomer
          onClose={() => setShowAddCustomerModal(false)}
          onSuccess={(newCust) => {
            setCustomers(prev => [newCust, ...prev]);
            setShowAddCustomerModal(false);
          }}
          authFetch={authFetch}
        />
      )}

      {/* 2. CREATE WORK ORDER MODAL */}
      {showCreateWOModal && (
        <ModalCreateWorkOrder
          onClose={() => setShowCreateWOModal(false)}
          onSuccess={(newWO) => {
            setWorkOrders(prev => [newWO, ...prev]);
            setShowCreateWOModal(false);
          }}
          authFetch={authFetch}
        />
      )}

      {/* 3. WORK ORDER DETAIL MODAL */}
      {selectedWO && (
        <ModalWorkOrderDetail
          wo={selectedWO}
          onClose={() => setSelectedWO(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* 4. CUSTOMER PROFILE DETAIL MODAL */}
      {selectedCustomer && (
        <ModalCustomerDetail
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* 5. FULL CALL TRANSCRIPT EXPANDED MODAL WINDOW */}
      {selectedSession && (
        <ModalCallSessionTranscript
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
};

// ── SUB-COMPONENT MODALS ───────────────────────────────────────────────────────

const ModalAddCustomer = ({ onClose, onSuccess, authFetch }) => {
  const [form, setForm] = useState({
    full_name: '', phone_number: '', email: '', property_address: '', apartment_number: '', language_preference: 'Finnish', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.phone_number) { setErr('Name and Phone Number are required.'); return; }
    setLoading(true); setErr('');
    try {
      const res = await authFetch('/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) setErr(data.error);
      else onSuccess(data.customer);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalCard} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}><i className="fa-solid fa-user-plus" style={{ color: 'var(--violet-glow)', marginRight: '6px' }} /> Add New Customer</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}><i className="fa-solid fa-xmark" /></button>
        </div>
        {err && <div style={{ color: 'var(--red-glow)', fontSize: '12px' }}>{err}</div>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input placeholder="Full Name *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} style={S.input} required />
          <input placeholder="Phone Number (e.g. +358 40 123 4567) *" value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} style={S.input} required />
          <input placeholder="Email Address" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={S.input} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <input placeholder="Property Address" value={form.property_address} onChange={e => setForm({ ...form, property_address: e.target.value })} style={{ ...S.input, flex: 2 }} />
            <input placeholder="Apt #" value={form.apartment_number} onChange={e => setForm({ ...form, apartment_number: e.target.value })} style={{ ...S.input, flex: 1 }} />
          </div>
          <select value={form.language_preference} onChange={e => setForm({ ...form, language_preference: e.target.value })} style={S.input}>
            <option value="Finnish">Finnish</option>
            <option value="English">English</option>
            <option value="Swedish">Swedish</option>
          </select>
          <textarea placeholder="Notes / Preferences" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...S.input, height: '60px', resize: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} style={S.btnSecondary}>Cancel</button>
            <button type="submit" disabled={loading} style={S.btnPrimary}>
              {loading ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ModalCreateWorkOrder = ({ onClose, onSuccess, authFetch }) => {
  const [form, setForm] = useState({
    property_address: '', apartment_number: '', is_common_area: false, issue_description: '',
    permit_master_key: false, special_notes: '', caller_phone_number: '', urgency_level: 'Standard',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.property_address || !form.issue_description) { setErr('Address and Issue Description are required.'); return; }
    setLoading(true); setErr('');
    try {
      const res = await authFetch('/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) setErr(data.error);
      else onSuccess(data.work_order);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalCard} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}><i className="fa-solid fa-clipboard-check" style={{ color: 'var(--violet-glow)', marginRight: '6px' }} /> Create New Work Order</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}><i className="fa-solid fa-xmark" /></button>
        </div>
        {err && <div style={{ color: 'var(--red-glow)', fontSize: '12px' }}>{err}</div>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input placeholder="Property Address *" value={form.property_address} onChange={e => setForm({ ...form, property_address: e.target.value })} style={{ ...S.input, flex: 2 }} required />
            <input placeholder="Apt #" value={form.apartment_number} onChange={e => setForm({ ...form, apartment_number: e.target.value })} style={{ ...S.input, flex: 1 }} />
          </div>
          <input placeholder="Caller Phone Number" value={form.caller_phone_number} onChange={e => setForm({ ...form, caller_phone_number: e.target.value })} style={S.input} />
          <textarea placeholder="Issue Description *" value={form.issue_description} onChange={e => setForm({ ...form, issue_description: e.target.value })} style={{ ...S.input, height: '70px', resize: 'none' }} required />
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_common_area} onChange={e => setForm({ ...form, is_common_area: e.target.checked })} /> Common Area
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.permit_master_key} onChange={e => setForm({ ...form, permit_master_key: e.target.checked })} /> Permit Master Key
            </label>
          </div>
          <select value={form.urgency_level} onChange={e => setForm({ ...form, urgency_level: e.target.value })} style={S.input}>
            <option value="Standard">Standard Urgency</option>
            <option value="Urgent">Urgent (Within 2 Hours)</option>
          </select>
          <textarea placeholder="Special Access Notes / Instructions" value={form.special_notes} onChange={e => setForm({ ...form, special_notes: e.target.value })} style={{ ...S.input, height: '50px', resize: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} style={S.btnSecondary}>Cancel</button>
            <button type="submit" disabled={loading} style={S.btnPrimary}>
              {loading ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Issue Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ModalWorkOrderDetail = ({ wo, onClose, onUpdateStatus }) => (
  <div style={S.modalOverlay} onClick={onClose}>
    <div style={S.modalCard} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)' }}>
          <i className="fa-solid fa-clipboard-list" style={{ marginRight: '6px' }} /> {wo.id}
        </h3>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}><i className="fa-solid fa-xmark" /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-muted)', padding: '10px', borderRadius: '6px' }}>
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>PROPERTY & APARTMENT</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{wo.property_address} {wo.apartment_number ? `(Apt ${wo.apartment_number})` : ''}</div>
          </div>
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>URGENCY</div>
            <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: wo.urgency_level === 'Urgent' ? 'rgba(239,68,68,0.15)' : 'var(--bg-muted)', color: wo.urgency_level === 'Urgent' ? 'var(--red-glow)' : 'var(--text-secondary)', fontWeight: 600 }}>
              {wo.urgency_level || 'Standard'}
            </span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>ISSUE DESCRIPTION</div>
          <div style={{ padding: '8px 10px', background: 'var(--bg-muted)', borderRadius: '6px', marginTop: '4px', lineHeight: 1.5, color: 'var(--text-primary)' }}>{wo.issue_description}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>CALLER PHONE</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)', marginTop: '2px' }}>{wo.caller_phone_number || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>PERMIT MASTER KEY</div>
            <div style={{ color: wo.permit_master_key ? '#22c55e' : 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
              {wo.permit_master_key ? '✓ Permitted' : '✗ No Master Key'}
            </div>
          </div>
        </div>

        {wo.special_notes && (
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>SPECIAL NOTES</div>
            <div style={{ padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: '6px', marginTop: '4px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>{wo.special_notes}</div>
          </div>
        )}

        <div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>UPDATE STATUS</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['Assigned', 'In Progress', 'Completed', 'Cancelled'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => onUpdateStatus(wo.id, st)}
                style={{
                  flex: 1, padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--border-light)',
                  background: wo.status === st ? 'var(--violet-glow)' : 'var(--bg-muted)',
                  color: wo.status === st ? '#fff' : 'var(--text-primary)', fontWeight: wo.status === st ? 600 : 400,
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ModalCustomerDetail = ({ customer, onClose }) => (
  <div style={S.modalOverlay} onClick={onClose}>
    <div style={S.modalCard} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}><i className="fa-solid fa-address-card" style={{ color: 'var(--violet-glow)', marginRight: '6px' }} /> Customer Profile</h3>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}><i className="fa-solid fa-xmark" /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
        <div style={{ background: 'var(--bg-muted)', padding: '12px', borderRadius: '8px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{customer.full_name}</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--violet-glow)', marginTop: '2px' }}>{customer.phone_number}</div>
        </div>
        <div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>ADDRESS</div>
          <div style={{ color: 'var(--text-primary)', marginTop: '2px' }}>{customer.property_address} {customer.apartment_number ? `(Apt ${customer.apartment_number})` : ''}</div>
        </div>
        <div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>PREFERRED LANGUAGE</div>
          <div style={{ color: 'var(--text-primary)', marginTop: '2px' }}>{customer.language_preference || 'Finnish'}</div>
        </div>
        <div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>NOTES / PREFERENCES</div>
          <div style={{ padding: '8px 10px', background: 'var(--bg-muted)', borderRadius: '6px', marginTop: '4px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>{customer.notes || 'No special notes recorded.'}</div>
        </div>
      </div>
    </div>
  </div>
);

// ── EXPANDED FULL CALL TRANSCRIPT MODAL WINDOW ─────────────────────────────────
const ModalCallSessionTranscript = ({ session, onClose }) => (
  <div style={S.modalOverlay} onClick={onClose}>
    <div style={{ ...S.modalCard, maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-phone-volume" style={{ color: 'var(--violet-glow)' }} />
            Full Call Transcript ({session.agent_label})
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {session.total_turns} total conversation turns • Avg Latency: {session.avg_e2e_ms} ms
          </span>
        </div>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}><i className="fa-solid fa-xmark" /></button>
      </div>

      {/* FULL CHAT CONVERSATION SCROLLABLE BODY */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px', minHeight: '320px' }}>
        {session.turns?.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: 'var(--bg-muted)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
              <span style={{ fontWeight: 700, color: 'var(--violet-glow)' }}>TURN #{t.turn}</span>
              <span>E2E Latency: <b style={{ color: (t.e2e_ms && t.e2e_ms < 1000) ? '#22c55e' : '#eab308' }}>{t.e2e_ms ? `${Math.round(t.e2e_ms)} ms` : '—'}</b></span>
            </div>

            {/* CALLER / USER BUBBLE */}
            {t.user_text && (
              <div style={{ alignSelf: 'flex-start', width: '90%', background: 'var(--bg-card)', borderRadius: '10px 10px 10px 2px', padding: '8px 12px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <i className="fa-solid fa-user" /> Caller / User
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{t.user_text}</div>
              </div>
            )}

            {/* ZORA AGENT BUBBLE */}
            {t.agent_text && (
              <div style={{ alignSelf: 'flex-end', width: '90%', background: 'rgba(167, 139, 250, 0.15)', borderRadius: '10px 10px 2px 10px', padding: '8px 12px', border: '1px solid rgba(167, 139, 250, 0.3)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--violet-glow)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <i className="fa-solid fa-robot" /> Zora AI Agent
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{t.agent_text}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
        <button type="button" onClick={onClose} style={S.btnPrimary}>Close Transcript Window</button>
      </div>
    </div>
  </div>
);
