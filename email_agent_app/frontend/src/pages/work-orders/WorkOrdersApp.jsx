import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';

const CustomSelect = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="custom-dropdown-container" style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="custom-dropdown-trigger"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12.5px',
          padding: '8px 12px',
          height: '38px',
          borderRadius: '8px',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-main, #fafafa)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          userSelect: 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-glow)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-light)';
        }}
      >
        <span>{value}</span>
        <i className={`fa-solid fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '10px', color: 'var(--text-muted)' }}></i>
      </div>

      {isOpen && (
        <div
          className="custom-dropdown-options"
          style={{
            position: 'absolute',
            top: '42px',
            left: 0,
            right: 0,
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            zIndex: 10000,
            overflow: 'hidden',
            maxHeight: '200px',
            overflowY: 'auto',
            animation: 'fade-in 0.15s ease'
          }}
        >
          {options.map((opt) => {
            const isSelected = opt === value;
            return (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                style={{
                  padding: '10px 12px',
                  fontSize: '12.5px',
                  color: isSelected ? 'var(--cyan-glow)' : 'var(--text-primary)',
                  background: isSelected ? 'var(--bg-muted)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-muted)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? 'var(--bg-muted)' : 'transparent')}
              >
                <span>{opt}</span>
                {isSelected && <i className="fa-solid fa-check" style={{ fontSize: '10px', color: 'var(--cyan-glow)' }}></i>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const WorkOrdersApp = () => {
  const { authFetch } = useAuth();
  
  // Data State
  const [properties, setProperties] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [activeTechFilter, setActiveTechFilter] = useState(null);
  const [activePropertyFilter, setActivePropertyFilter] = useState(null);
  
  // Resizer state
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isDraggingRef = useRef(false);

  // Highlighting ticket
  const [highlightId, setHighlightId] = useState(null);

  // Editing state
  const [editingWo, setEditingWo] = useState(null);
  const [editForm, setEditForm] = useState({
    property_address: '',
    apartment_number: '',
    technician: '',
    technician_phone: '',
    scheduled_time: '',
    urgency_level: 'Standard',
    status: 'Assigned',
    issue_description: ''
  });

  useEffect(() => {
    // Check highlight param
    const params = new URLSearchParams(window.location.search);
    const hl = params.get('highlight');
    if (hl) {
      setHighlightId(hl);
    }

    Promise.all([loadProperties(), loadWorkOrders()]).then(() => {
      setLoading(false);
    });
  }, []);

  const loadProperties = async () => {
    try {
      const res = await authFetch('/api/properties');
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadWorkOrders = async () => {
    try {
      const res = await authFetch('/api/work-orders');
      if (res.ok) {
        const data = await res.json();
        setWorkOrders(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Drag resizer handlers
  const handleMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const nextW = Math.max(180, Math.min(500, e.clientX));
    setSidebarWidth(nextW);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Toggle Filters
  const toggleTechFilter = (techName) => {
    setActiveTechFilter(prev => prev === techName ? null : techName);
    setActivePropertyFilter(null);
  };

  const togglePropertyFilter = (addr) => {
    setActivePropertyFilter(prev => prev === addr ? null : addr);
    setActiveTechFilter(null);
  };

  const clearAllFilters = () => {
    setActiveTechFilter(null);
    setActivePropertyFilter(null);
  };

  // Cycle Status
  const handleCycleStatus = async (id, currentStatus) => {
    const next = currentStatus === 'Assigned' ? 'In Progress' : 'Completed';
    try {
      const res = await authFetch(`/api/work-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      if (res.ok) {
        const updated = await res.json();
        setWorkOrders(prev => prev.map(w => w.id === id ? updated : w));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete ticket
  const handleDeleteWorkOrder = async (id) => {
    if (!confirm(`Are you sure you want to delete Work Order ${id}?`)) return;
    try {
      const res = await authFetch(`/api/work-orders/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setWorkOrders(prev => prev.filter(w => w.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartEdit = (wo) => {
    setEditingWo(wo);
    setEditForm({
      property_address: wo.property_address || '',
      apartment_number: wo.apartment_number || '',
      technician: wo.technician || '',
      technician_phone: wo.technician_phone || '',
      scheduled_time: wo.scheduled_time || '',
      urgency_level: wo.urgency_level || 'Standard',
      status: wo.status || 'Assigned',
      issue_description: wo.issue_description || ''
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingWo) return;
    try {
      const res = await authFetch(`/api/work-orders/${editingWo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      if (res.ok) {
        const updated = await res.json();
        setWorkOrders(prev => prev.map(w => w.id === editingWo.id ? updated : w));
        setEditingWo(null);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save modifications.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving modifications.');
    }
  };

  // Get unique techs
  const uniqueTechs = [];
  properties.forEach(p => {
    if (!uniqueTechs.some(t => t.name === p.technician)) {
      uniqueTechs.push({
        name: p.technician,
        phone: p.technician_phone,
        company: p.company
      });
    }
  });

  // Filter orders
  let filtered = [...workOrders];
  if (activeTechFilter) {
    filtered = filtered.filter(w => w.technician === activeTechFilter);
  }
  if (activePropertyFilter) {
    filtered = filtered.filter(w => w.property_address.toLowerCase().includes(activePropertyFilter.toLowerCase()));
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="page-main">
        <div className="app-container erp-grid" style={{ height: '100%', width: '100%' }}>
          
          {/* Collapsible Filters Left Panel */}
          <div className="erp-sidebar" style={{ width: `${sidebarWidth}px`, flex: `0 0 ${sidebarWidth}px`, display: 'flex', flexDirection: 'column' }}>
            <div className="sidebar-group-header" style={{ padding: '20px', borderBottom: '1px solid var(--border-light)' }}>
              <h3 className="sidebar-group-title" style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                <i className="fa-solid fa-filter"></i> Filters Sidebar
              </h3>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              
              {/* Properties list */}
              <div style={{ marginBottom: '24px' }}>
                <span className="voice-selector-label" style={{ display: 'block', marginBottom: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
                  HELSINKI PROPERTIES
                </span>
                <ul className="properties-list" style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {properties.map(p => {
                    const isActive = activePropertyFilter === p.address;
                    return (
                      <li 
                        key={p.id} 
                        className={`property-item ${isActive ? 'property-item-active' : ''}`}
                        onClick={() => togglePropertyFilter(p.address)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="property-info">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <span className="property-address">{p.address}</span>
                            {isActive && <span className="filter-pill"><i className="fa-solid fa-circle-check"></i></span>}
                          </div>
                          <span className="property-meta">
                            <i className="fa-solid fa-user-shield"></i> {p.technician}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Technicians list */}
              <div>
                <span className="voice-selector-label" style={{ display: 'block', marginBottom: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
                  RESPONSIBLE TECHNICIANS
                </span>
                <ul className="tech-list" style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {uniqueTechs.map(t => {
                    const isActive = activeTechFilter === t.name;
                    return (
                      <li 
                        key={t.name}
                        className={`tech-item ${isActive ? 'tech-item-active' : ''}`}
                        onClick={() => toggleTechFilter(t.name)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="tech-info">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <span className="tech-name">{t.name}</span>
                            {isActive && <span className="filter-pill"><i className="fa-solid fa-circle-check"></i></span>}
                          </div>
                          <span className="tech-meta"><i className="fa-solid fa-phone"></i> {t.phone}</span>
                          <span className="tech-meta"><i className="fa-solid fa-building"></i> {t.company}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

            </div>
          </div>

          {/* Resizer bar handle */}
          <div 
            id="splitter-sidebar-board" 
            className="splitter" 
            onMouseDown={handleMouseDown}
            style={{ width: '4px', cursor: 'col-resize', background: 'var(--border-light)', zIndex: 10 }}
          ></div>

          {/* Main active work orders board layout */}
          <div className="erp-main-board" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
            
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 800 }}>Work Orders ERP Dashboard</h1>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Main system database table tracking incoming maintenance reports
                </p>
              </div>
              <div className="badge-source source-voice" id="wo-count" style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '16px' }}>
                {workOrders.length} Active
              </div>
            </header>

            {/* Main filter info banner */}
            {(activeTechFilter || activePropertyFilter) && (
              <div className="filter-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                  <i className="fa-solid fa-filter" style={{ marginRight: '6px', color: 'var(--violet-glow)' }}></i> 
                  Filtering work orders by: <strong>{activeTechFilter || activePropertyFilter}</strong>
                </span>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={clearAllFilters}
                  style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px' }}
                >
                  <i className="fa-solid fa-circle-xmark"></i> Clear Filters
                </button>
              </div>
            )}

            {/* Board cards mapping */}
            <div className="work-orders-board" id="work-orders-board" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              {loading ? (
                <div className="loading-placeholder">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <p>Loading work orders database...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="loading-placeholder">
                  <i className="fa-solid fa-box-open"></i>
                  <p>{activeTechFilter || activePropertyFilter ? 'No tickets match the current search filters.' : 'No active tickets found. Database is empty.'}</p>
                </div>
              ) : (
                filtered.map(wo => {
                  const isHighlighted = highlightId === wo.id;
                  
                  let statusClass = 'status-assigned';
                  if (wo.status?.toLowerCase() === 'in progress') statusClass = 'status-progress';
                  else if (wo.status?.toLowerCase() === 'completed') statusClass = 'status-completed';

                  const urgencyClass = wo.urgency_level === 'Urgent' ? 'urgency-urgent' : 'urgency-standard';

                  return (
                    <div 
                      key={wo.id} 
                      className={`wo-card ${isHighlighted ? 'freshly-created pe-flash' : ''}`}
                      id={`wo-${wo.id}`}
                      style={{ animation: 'fade-in 0.4s ease' }}
                    >
                      <div className="wo-card-header">
                        <span className="wo-id"><i className="fa-solid fa-receipt"></i> {wo.id}</span>
                        <div className="wo-actions-wrap">
                          <div className="wo-badges">
                            <span className={`badge-source ${wo.source === 'email' ? 'source-email' : 'source-voice'}`}>
                              <i className={`fa-solid ${wo.source === 'email' ? 'fa-envelope' : 'fa-phone'}`}></i> {wo.source === 'email' ? 'Email' : 'Voice'}
                            </span>
                            <span className={`badge-status ${statusClass}`}>{wo.status}</span>
                            <span className={`badge-urgency ${urgencyClass}`}>{wo.urgency_level}</span>
                          </div>
                          
                          <div className="wo-card-actions">
                            <button 
                              type="button"
                              className="btn-action-status" 
                              onClick={() => handleStartEdit(wo)} 
                              title="Edit work order"
                              style={{ marginRight: '6px' }}
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                            {wo.status !== 'Completed' && (
                              <button 
                                type="button"
                                className="btn-action-status" 
                                onClick={() => handleCycleStatus(wo.id, wo.status)} 
                                title="Advance ticket status"
                              >
                                <i className={`fa-solid ${wo.status === 'Assigned' ? 'fa-play' : 'fa-check'}`}></i>
                              </button>
                            )}
                            <button 
                              type="button"
                              className="btn-action-delete" 
                              onClick={() => handleDeleteWorkOrder(wo.id)} 
                              title="Delete work order"
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="wo-details">
                        <div className="detail-row">
                          <i className="fa-solid fa-location-dot"></i>
                          <div className="detail-content">
                            <span className="detail-label">Property / Unit</span>
                            <span className="detail-val">{wo.property_address} ({wo.apartment_number})</span>
                          </div>
                        </div>
                        <div className="detail-row">
                          <i className="fa-solid fa-user-gear"></i>
                          <div className="detail-content">
                            <span className="detail-label">Assigned Maintenance Tech</span>
                            <span className="detail-val">{wo.technician} ({wo.technician_phone})</span>
                          </div>
                        </div>
                        <div className="detail-row">
                          <i className="fa-solid fa-key"></i>
                          <div className="detail-content">
                            <span className="detail-label">Master Key Permission</span>
                            <span className="detail-val">{wo.permit_master_key ? 'YES, PERMITTED TO USE' : 'NO, OWNER WILL BE HOME'}</span>
                          </div>
                        </div>
                        <div className="detail-row">
                          <i className="fa-solid fa-clock"></i>
                          <div className="detail-content">
                            <span className="detail-label">Scheduled Arrival</span>
                            <span className="detail-val" style={{ color: 'var(--cyan-glow)', fontWeight: 700 }}>{wo.scheduled_time}</span>
                          </div>
                        </div>
                        <div className="detail-row wo-details-full">
                          <div className="detail-content">
                            <span className="detail-label">Resident Issue description</span>
                            <span className="detail-val">{wo.issue_description} {wo.special_notes && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}><em>Note: {wo.special_notes}</em></span>}</span>
                          </div>
                        </div>
                      </div>

                      <div className="wo-footer">
                        <span className="wo-time"><i className="fa-regular fa-calendar-days"></i> {new Date(wo.created_at).toLocaleString('fi-FI')}</span>
                        <span className="wo-caller">
                          <i className="fa-solid fa-user"></i> {wo.source === 'email' ? `Sender: ${wo.sender_email}` : `Caller: ${wo.caller_phone_number}`}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

        </div>
      </div>

      {editingWo && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 13, 26, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div className="erp-card" style={{
            width: '100%',
            maxWidth: '500px',
            background: 'var(--bg-card, #ffffff)',
            borderRadius: '16px',
            border: '1px solid var(--border-light, rgba(255,255,255,0.08))',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-pen-to-square" style={{ color: 'var(--violet-glow)' }}></i> Edit Work Order {editingWo.id}
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingWo(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Property Address</label>
                  <input 
                    type="text" 
                    className="dialer-display-input"
                    style={{ fontSize: '12.5px', padding: '8px 12px', height: 'auto', background: 'var(--bg-main)' }}
                    value={editForm.property_address} 
                    onChange={e => setEditForm(prev => ({ ...prev, property_address: e.target.value }))}
                    required
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Apartment</label>
                  <input 
                    type="text" 
                    className="dialer-display-input"
                    style={{ fontSize: '12.5px', padding: '8px 12px', height: 'auto', background: 'var(--bg-main)' }}
                    value={editForm.apartment_number} 
                    onChange={e => setEditForm(prev => ({ ...prev, apartment_number: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Technician Name</label>
                  <input 
                    type="text" 
                    className="dialer-display-input"
                    style={{ fontSize: '12.5px', padding: '8px 12px', height: 'auto', background: 'var(--bg-main)' }}
                    value={editForm.technician} 
                    onChange={e => setEditForm(prev => ({ ...prev, technician: e.target.value }))}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Technician Phone</label>
                  <input 
                    type="text" 
                    className="dialer-display-input"
                    style={{ fontSize: '12.5px', padding: '8px 12px', height: 'auto', background: 'var(--bg-main)' }}
                    value={editForm.technician_phone} 
                    onChange={e => setEditForm(prev => ({ ...prev, technician_phone: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Scheduled Arrival</label>
                  <input 
                    type="text" 
                    className="dialer-display-input"
                    style={{ fontSize: '12.5px', padding: '8px 12px', height: 'auto', background: 'var(--bg-main)', color: 'var(--cyan-glow)', fontWeight: 'bold' }}
                    value={editForm.scheduled_time} 
                    onChange={e => setEditForm(prev => ({ ...prev, scheduled_time: e.target.value }))}
                    required
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Urgency</label>
                  <CustomSelect 
                    value={editForm.urgency_level} 
                    options={["Standard", "Urgent", "Emergency", "Low"]}
                    onChange={val => setEditForm(prev => ({ ...prev, urgency_level: val }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Ticket Status</label>
                  <CustomSelect 
                    value={editForm.status} 
                    options={["Assigned", "In Progress", "Completed"]}
                    onChange={val => setEditForm(prev => ({ ...prev, status: val }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10.5px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Issue Description</label>
                <textarea 
                  className="dialer-display-input"
                  style={{ fontSize: '12.5px', padding: '10px 12px', height: '80px', minHeight: '60px', resize: 'none', background: 'var(--bg-main)', lineHeight: '1.4' }}
                  value={editForm.issue_description} 
                  onChange={e => setEditForm(prev => ({ ...prev, issue_description: e.target.value }))}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '14px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setEditingWo(null)}
                  style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-call-primary"
                  style={{ 
                    padding: '8px 18px', 
                    borderRadius: '8px', 
                    fontSize: '12px', 
                    cursor: 'pointer',
                    background: 'linear-gradient(135deg, var(--cyan-glow), var(--violet-glow))',
                    border: 'none',
                    color: '#fff'
                  }}
                >
                  Save Modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
