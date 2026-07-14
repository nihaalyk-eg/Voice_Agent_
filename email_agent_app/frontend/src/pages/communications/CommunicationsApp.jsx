import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';
import { useNav } from '../../NavContext';

export const CommunicationsApp = () => {
  const { authFetch } = useAuth();
  const { lastAgentContext } = useNav();

  const [comms, setComms] = useState([]);
  // Default to whichever agent's channel you came from — Voice Agent
  // shows Calls, Email Agent shows Emails — instead of always mixing
  // both channels together under "All Logs".
  const [activeFilter, setActiveFilter] = useState(
    lastAgentContext === 'voice' ? 'call_transcript' : 'email_intake',
  );
  const [loading, setLoading] = useState(true);

  // Expanded transcripts state (dictionary of id -> true/false)
  const [expandedTranscripts, setExpandedTranscripts] = useState({});

  useEffect(() => {
    loadComms();
  }, []);

  const loadComms = async () => {
    try {
      const res = await authFetch('/api/communications');
      if (res.ok) {
        const data = await res.json();
        setComms(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleTranscript = (id) => {
    setExpandedTranscripts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const navigateToWorkOrder = (woId) => {
    window.location.href = `/work-orders.html?highlight=${woId}`;
  };

  // Filter logs
  const filteredComms = activeFilter === 'all' 
    ? comms 
    : comms.filter(c => c.type === activeFilter);

  const typeIcon = { 
    call_transcript: 'fa-phone', 
    sms_confirmation: 'fa-message', 
    email_intake: 'fa-envelope', 
    escalation: 'fa-triangle-exclamation' 
  };

  const typeLabel = { 
    call_transcript: 'Voice Call', 
    sms_confirmation: 'SMS Sent', 
    email_intake: 'Email Processed', 
    escalation: 'EMERGENCY ESCALATION' 
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="page-main">
        <div className="app-container" style={{ flexDirection: 'column' }}>

          {/* Filters tabs bar */}
          <div className="comms-filters-bar" style={{ display: 'flex', gap: '8px', padding: '24px 24px 0 24px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Logs', icon: 'fa-box-archive' },
              { id: 'call_transcript', label: 'Calls', icon: 'fa-phone' },
              { id: 'email_intake', label: 'Emails', icon: 'fa-envelope' },
              { id: 'sms_confirmation', label: 'SMS', icon: 'fa-message' },
              { id: 'escalation', label: 'Escalations', icon: 'fa-triangle-exclamation' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`comms-filter-btn ${activeFilter === tab.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  cursor: 'pointer'
                }}
              >
                <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
              </button>
            ))}
          </div>

          {/* Timeline mapping */}
          <div className="comms-timeline-container" style={{ padding: '0 24px 24px 24px', flex: 1, overflowY: 'auto' }}>
            <div className="comms-timeline" id="comms-timeline">
              {loading ? (
                <div className="loading-placeholder">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <p>Loading history timeline...</p>
                </div>
              ) : filteredComms.length === 0 ? (
                <div className="loading-placeholder">
                  <i className="fa-solid fa-inbox"></i>
                  <p>No communication logs found for this filter query.</p>
                </div>
              ) : (
                filteredComms.map(comm => {
                  const icon = typeIcon[comm.type] || 'fa-circle-info';
                  const label = typeLabel[comm.type] || comm.type;
                  const timeStr = new Date(comm.timestamp).toLocaleString('fi-FI');
                  const isExpanded = !!expandedTranscripts[comm.id];

                  let itemContent = null;
                  
                  if (comm.type === 'call_transcript') {
                    const messages = Array.isArray(comm.transcript) 
                      ? comm.transcript 
                      : (comm.transcript ? Object.values(comm.transcript) : []);
                    
                    itemContent = (
                      <>
                        {comm.summary && <div className="comms-summary">{comm.summary}</div>}
                        {comm.duration_seconds && (
                          <span className="comms-duration">
                            <i className="fa-solid fa-stopwatch"></i> Duration: {comm.duration_seconds}s
                          </span>
                        )}
                        {messages.length > 0 && (
                          <details 
                            className="comms-transcript-details" 
                            open={isExpanded} 
                            onClick={(e) => { e.preventDefault(); toggleTranscript(comm.id); }}
                            style={{ marginTop: '10px' }}
                          >
                            <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                              <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ marginRight: '6px' }}></i> 
                              View Chat Transcript ({messages.length} messages)
                            </summary>
                            {isExpanded && (
                              <div className="comms-transcript-content" style={{ marginTop: '10px' }}>
                                {messages.map((msg, idx) => (
                                  <div key={idx} className={`transcript-msg transcript-msg-${msg.role}`}>
                                    <span className="tm-role">{msg.role === 'agent' ? 'Agent' : 'Caller'}</span>
                                    <span className="tm-text">{msg.text || msg.content || ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </details>
                        )}
                      </>
                    );
                  } 
                  
                  else if (comm.type === 'sms_confirmation') {
                    itemContent = (
                      <>
                        <div className="comms-sms-recipient">
                          <i className="fa-solid fa-mobile-screen"></i> Recipient: {comm.recipient_phone || comm.caller_phone || ''}
                        </div>
                        <div className="comms-sms-body" style={{ marginTop: '6px', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                          {comm.message || ''}
                        </div>
                      </>
                    );
                  } 
                  
                  else if (comm.type === 'email_intake') {
                    const orig = comm.original_email || {};
                    itemContent = (
                      <>
                        <div className="comms-email-from"><i className="fa-solid fa-user"></i> Sender: {comm.sender_email || orig.from || ''}</div>
                        {orig.subject && <div className="comms-email-subject" style={{ fontSize: '12.5px', marginTop: '4px' }}><strong>Subject:</strong> {orig.subject}</div>}
                        {comm.summary && <div className="comms-summary" style={{ marginTop: '8px' }}>{comm.summary}</div>}
                      </>
                    );
                  } 
                  
                  else if (comm.type === 'escalation') {
                    itemContent = (
                      <>
                        <div className="comms-escalation-reason"><i className="fa-solid fa-siren-on" style={{ color: 'var(--red-glow)' }}></i> Handoff: {comm.reason || ''}</div>
                        {comm.property_address && <div className="comms-escalation-addr" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}><i className="fa-solid fa-location-dot"></i> {comm.property_address}</div>}
                      </>
                    );
                  }

                  return (
                    <div key={comm.id} className={`comms-item comms-${comm.type}`} style={{ animation: 'fade-in 0.4s ease' }}>
                      <div className="comms-item-icon"><i className={`fa-solid ${icon}`}></i></div>
                      <div className="comms-item-body">
                        <div className="comms-item-header">
                          <span className="comms-type-label">{label}</span>
                          {comm.linked_work_order && (
                            <span 
                              className="comms-linked-wo" 
                              onClick={() => navigateToWorkOrder(comm.linked_work_order)}
                              style={{ cursor: 'pointer' }}
                            >
                              <i className="fa-solid fa-receipt"></i> {comm.linked_work_order}
                            </span>
                          )}
                          <span className="comms-timestamp">{timeStr}</span>
                        </div>
                        <div className="comms-item-content" style={{ marginTop: '10px' }}>
                          {itemContent}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
