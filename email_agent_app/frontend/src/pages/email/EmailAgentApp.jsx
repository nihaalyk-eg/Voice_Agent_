import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';
import { usePersistedState } from '../../hooks/usePersistedState';

function buildSystemReply(workOrder, extractionReport) {
  const needsFollowup = !!extractionReport?.needs_followup;
  const missingFields = extractionReport?.missing_fields || [];

  if (needsFollowup) {
    const missingList = missingFields.length > 0
      ? missingFields.map(f => `  • ${f.replace(/_/g, ' ')}`)
      : ['  • property address and/or contact phone number'];

    return {
      type: 'followup',
      subject: `Re: ${workOrder?.issue_description || 'Your maintenance request'} — More info needed`,
      body: `Dear Resident,

Thank you for contacting Zora Property Management.

We received your maintenance request but need a few more details to process it:

${missingList.join('\n')}

Please reply with the above information and we will create your work order immediately.

Best regards,
Zora Property Management`,
    };
  }

  const name = extractionReport?.resident_name || 'Resident';

  return {
    type: 'confirmation',
    subject: `Work Order ${workOrder?.id} Confirmed — ${workOrder?.issue_description}`,
    body: `Dear ${name},

Your maintenance request has been received and processed.

Work Order:  ${workOrder?.id}
Priority:    ${workOrder?.urgency_level}
Address:     ${workOrder?.property_address}
Apartment:   ${workOrder?.apartment_number || 'N/A'}
Issue:       ${workOrder?.issue_description}
Technician:  ${workOrder?.technician}
Scheduled:   ${workOrder?.scheduled_time}

${workOrder?.urgency_level === 'Urgent'
  ? 'A technician is being dispatched immediately and will arrive within 2 hours.'
  : 'Our technician will contact you before arrival to confirm the appointment time.'}

Best regards,
Zora Property Management`,
  };
}

const inputStyle = {
  borderRadius: '8px', padding: '9px 12px', fontSize: '12px',
  border: '1px solid var(--border-light)', background: 'var(--bg-card)',
  color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
};

const sendBtnStyle = (disabled) => ({
  padding: '10px', borderRadius: '8px', border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: 'linear-gradient(135deg, var(--cyan-glow), var(--violet-glow))',
  color: '#fff', fontSize: '12px', fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  opacity: disabled ? 0.5 : 1, transition: 'opacity 0.2s',
});

export const EmailAgentApp = () => {
  const { authFetch } = useAuth();

  const [inboundEmails, setInboundEmails] = useState([]);
  const [pendingWOs, setPendingWOs] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [selectedComm, setSelectedComm] = useState(null);

  const [activeTab, setActiveTab] = useState('inbox');

  const [inputFrom, setInputFrom] = useState('');
  const [inputSubject, setInputSubject] = useState('');
  const [inputBody, setInputBody] = useState('');

  const [chainThread, setChainThread] = useState([]);
  const [chainProcessing, setChainProcessing] = useState(false);
  const [chainDone, setChainDone] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [lastFromAddr, setLastFromAddr] = useState('');
  const [lastSubject, setLastSubject] = useState('');
  const threadEndRef = useRef(null);

  const [processingState, setProcessingState] = useState('idle');
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [extractionResult, setExtractionResult] = useState(null);
  const [elapsedTime, setElapsedTime] = useState('0.0');
  const [lastSynced, setLastSynced] = useState(null);

  // ── Settings drawer ────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pollIntervalSec, setPollIntervalSec] = usePersistedState('email.pollIntervalSec', 30);

  const fetchInbox = useCallback(async () => {
    try {
      const [commRes, pendingRes] = await Promise.all([
        authFetch('/api/communications?type=email_intake&limit=50'),
        authFetch('/api/pending-work-orders'),
      ]);
      if (commRes.ok) setInboundEmails(await commRes.json());
      if (pendingRes.ok) setPendingWOs(await pendingRes.json());
      setLastSynced(new Date());
    } catch (err) {
      console.error('Inbox fetch error', err);
    } finally {
      setLoadingInbox(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchInbox();
    const t = setInterval(fetchInbox, pollIntervalSec * 1000);
    return () => clearInterval(t);
  }, [fetchInbox, pollIntervalSec]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chainThread, chainProcessing]);

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const selectCommCard = (comm) => {
    setSelectedComm(comm);
    const ex = comm.extracted_data || {};
    setExtractionResult({
      work_order: { id: comm.linked_work_order, ...ex },
      extraction_report: ex,
      customer_matched: !!comm.sender_email,
    });
    setElapsedTime('—');
    setProcessingState('success');
  };

  const processEmail = async (email) => {
    setChainProcessing(true);
    setProcessingState('processing');
    setProcessingStep(0);
    const startTime = Date.now();

    const stepTimer = setInterval(() => {
      setProcessingStep(p => { if (p < 3) return p + 1; clearInterval(stepTimer); return p; });
    }, 500);

    try {
      const res = await authFetch('/api/email-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email),
      });
      clearInterval(stepTimer);
      setProcessingStep(4);

      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.error || 'Processing failed.');
        setProcessingState('error');
        setChainProcessing(false);
        return null;
      }

      const data = await res.json();
      setElapsedTime(((Date.now() - startTime) / 1000).toFixed(1));
      setExtractionResult(data);
      setProcessingState('success');
      fetchInbox();
      return data;
    } catch (err) {
      clearInterval(stepTimer);
      setErrorMsg(`Network error: ${err.message}`);
      setProcessingState('error');
      setChainProcessing(false);
      return null;
    }
  };

  const sendInitialEmail = async () => {
    if (!inputBody.trim() || chainProcessing) return;

    const fromAddr = inputFrom.trim() || 'resident@example.com';
    const subject = inputSubject.trim() || 'Maintenance request';

    setChainThread([]);
    setChainDone(false);
    setShowReplyBox(false);
    setReplyText('');
    setLastFromAddr(fromAddr);
    setLastSubject(subject);

    const email = { from: fromAddr, subject, body: inputBody.trim() };

    setChainThread([{
      role: 'resident',
      subject,
      body: inputBody.trim(),
      from: fromAddr,
      ts: new Date().toISOString(),
    }]);

    const data = await processEmail(email);
    if (!data) return;

    const sysReply = buildSystemReply(data.work_order, data.extraction_report);
    setChainThread(prev => [...prev, {
      role: 'system',
      subject: sysReply.subject,
      body: sysReply.body,
      replyType: sysReply.type,
      workOrderId: data.work_order?.id,
      ts: new Date().toISOString(),
    }]);
    setChainProcessing(false);

    if (sysReply.type === 'confirmation') {
      setChainDone(true);
    } else {
      setShowReplyBox(true);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || chainProcessing) return;

    const replyEmail = {
      from: lastFromAddr,
      subject: `Re: ${lastSubject}`,
      body: replyText.trim(),
    };

    setShowReplyBox(false);
    setChainThread(prev => [...prev, {
      role: 'resident',
      subject: replyEmail.subject,
      body: replyText.trim(),
      from: lastFromAddr,
      ts: new Date().toISOString(),
    }]);
    setReplyText('');

    const data = await processEmail(replyEmail);
    if (!data) return;

    const sysReply = buildSystemReply(data.work_order, data.extraction_report);
    setChainThread(prev => [...prev, {
      role: 'system',
      subject: sysReply.subject,
      body: sysReply.body,
      replyType: sysReply.type,
      workOrderId: data.work_order?.id,
      ts: new Date().toISOString(),
    }]);
    setChainProcessing(false);

    if (sysReply.type === 'confirmation') {
      setChainDone(true);
    } else {
      setShowReplyBox(true);
      setReplyText('');
    }
  };

  const resetChain = () => {
    setChainThread([]);
    setChainDone(false);
    setShowReplyBox(false);
    setReplyText('');
    setProcessingState('idle');
    setExtractionResult(null);
    setInputFrom('');
    setInputSubject('');
    setInputBody('');
  };

  const residentName = extractionResult?.extraction_report?.resident_name;
  const residentLanguage = extractionResult?.extraction_report?.resident_language;
  const parsingMethod = extractionResult?.extraction_report?.parsing_method || 'llm';
  const customerMatched = extractionResult?.customer_matched;

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="page-main" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green-glow)', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>Email Agent</span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>· {loadingInbox ? 'Syncing…' : 'Live'}</span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
              fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', fontFamily: 'inherit',
            }}
          >
            <i className="fa-solid fa-gear"></i> Settings
          </button>
        </div>

        <div className="app-container" style={{ flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="email-agent-layout" style={{ flex: 1, minHeight: 0 }}>

            {/* Left Column */}
            <div className="erp-card scrollable-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 className="erp-card-title" style={{ marginBottom: '16px' }}>
                <i className="fa-solid fa-inbox"></i> Email Agent
              </h3>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-muted)', padding: '4px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border-light)' }}>
                {[{ key: 'inbox', icon: 'fa-inbox', label: 'Live Inbox' }, { key: 'chain', icon: 'fa-envelope-open-text', label: 'Email Chain' }].map(({ key, icon, label }) => (
                  <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
                    flex: 1, padding: '8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none',
                    background: activeTab === key ? 'var(--bg-card)' : 'transparent',
                    color: activeTab === key ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: activeTab === key ? '600' : 'normal', transition: 'all 0.2s',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                  }}>
                    <i className={`fa-solid ${icon}`}></i> {label}
                  </button>
                ))}
              </div>

              {/* Live Inbox */}
              {activeTab === 'inbox' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
                  {pendingWOs.length > 0 && (
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--violet-glow)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                        <i className="fa-solid fa-clock"></i> Awaiting Reply ({pendingWOs.length})
                      </span>
                      {pendingWOs.map(wo => (
                        <div key={wo.id} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.05)', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{wo.sender_name || wo.sender_email}</span>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(139,92,246,0.15)', color: 'var(--violet-glow)', border: '1px solid rgba(139,92,246,0.3)' }}>
                              Follow-up {wo.follow_up_count}/3
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{wo.original_subject}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {loadingInbox ? 'Loading…' : `${inboundEmails.length} email${inboundEmails.length !== 1 ? 's' : ''}`}
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    {loadingInbox
                      ? <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '20px', display: 'block', marginBottom: '10px' }}></i>Loading…</div>
                      : inboundEmails.length === 0
                        ? (
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <i className="fa-solid fa-inbox" style={{ fontSize: '30px', marginBottom: '12px', opacity: 0.35 }}></i>
                            <strong style={{ fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>No emails yet</strong>
                            <p style={{ fontSize: '11.5px', lineHeight: 1.6, maxWidth: '240px', opacity: 0.7 }}>
                              Use the Email Chain tab to send an email through the AI pipeline — processed emails will appear here.
                            </p>
                          </div>
                        )
                        : inboundEmails.map(comm => {
                          const ex = comm.extracted_data || {};
                          const isSelected = selectedComm?.id === comm.id;
                          return (
                            <div key={comm.id} onClick={() => selectCommCard(comm)}
                              style={{
                                padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s',
                                border: isSelected ? '1px solid var(--violet-glow)' : '1px solid var(--border-light)',
                                background: isSelected ? 'var(--bg-muted)' : 'var(--bg-card)',
                                display: 'flex', flexDirection: 'column', gap: '5px',
                              }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comm.sender_email}</div>
                                  <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{ex.issue_description || '—'}</div>
                                </div>
                                {comm.linked_work_order && (
                                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(34,197,94,0.15)', color: 'var(--green-glow)', border: '1px solid rgba(34,197,94,0.3)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px', height: 'fit-content' }}>
                                    <i className="fa-solid fa-circle-check"></i> {comm.linked_work_order}
                                  </span>
                                )}
                              </div>
                              {ex.property_address && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}><i className="fa-solid fa-location-dot" style={{ marginRight: '5px' }}></i>{ex.property_address}</div>}
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{fmtTime(comm.timestamp)}</div>
                            </div>
                          );
                        })
                    }
                  </div>
                </div>
              )}

              {/* Email Chain */}
              {activeTab === 'chain' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>

                  {/* Compose form — visible only when no chain started */}
                  {chainThread.length === 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Compose inbound email
                      </span>
                      <input
                        type="text"
                        placeholder="From (e.g. resident@example.com)"
                        value={inputFrom}
                        onChange={e => setInputFrom(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        placeholder="Subject"
                        value={inputSubject}
                        onChange={e => setInputSubject(e.target.value)}
                        style={inputStyle}
                      />
                      <textarea
                        placeholder="Email body — describe the maintenance issue. Include name, address, and phone to test full extraction, or leave some out to trigger a follow-up request."
                        value={inputBody}
                        onChange={e => setInputBody(e.target.value)}
                        rows={7}
                        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                      />
                      <button
                        type="button"
                        onClick={sendInitialEmail}
                        disabled={!inputBody.trim() || chainProcessing}
                        style={sendBtnStyle(!inputBody.trim() || chainProcessing)}
                      >
                        <i className="fa-solid fa-paper-plane"></i> Send to AI Agent
                      </button>
                    </div>
                  )}

                  {/* Thread view */}
                  {chainThread.length > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Thread</span>
                        {!chainProcessing && (
                          <button type="button" onClick={resetChain}
                            style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="fa-solid fa-rotate-left"></i> New email
                          </button>
                        )}
                      </div>

                      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', minHeight: 0 }}>
                        {chainThread.map((msg, i) => {
                          const isResident = msg.role === 'resident';
                          const isConfirmation = msg.replyType === 'confirmation';

                          return (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isResident ? 'flex-end' : 'flex-start', gap: '3px' }}>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '0 6px' }}>
                                {isResident ? msg.from : 'Zora System'} · {fmtTime(msg.ts)}
                              </span>
                              <div style={{
                                maxWidth: '90%', padding: '11px 14px', fontSize: '11.5px', lineHeight: 1.6,
                                borderRadius: isResident ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                                background: isResident
                                  ? 'rgba(139,92,246,0.08)'
                                  : isConfirmation ? 'rgba(34,197,94,0.07)' : 'rgba(6,182,212,0.07)',
                                border: isResident
                                  ? '1px solid rgba(139,92,246,0.2)'
                                  : isConfirmation ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(6,182,212,0.2)',
                              }}>
                                <div style={{
                                  fontSize: '10.5px', fontWeight: 600, marginBottom: '6px',
                                  color: isResident ? 'var(--violet-glow)' : isConfirmation ? 'var(--green-glow)' : 'var(--cyan-glow)',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                                }}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.subject}</span>
                                  {msg.workOrderId && (
                                    <span style={{ fontSize: '9.5px', padding: '1px 6px', borderRadius: '99px', background: 'rgba(34,197,94,0.15)', color: 'var(--green-glow)', border: '1px solid rgba(34,197,94,0.3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                      {msg.workOrderId}
                                    </span>
                                  )}
                                </div>
                                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, color: 'var(--text-secondary)' }}>{msg.body}</pre>
                              </div>
                            </div>
                          );
                        })}

                        {chainProcessing && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '11.5px', padding: '4px 6px' }}>
                            <i className="fa-solid fa-circle-notch fa-spin" style={{ color: 'var(--violet-glow)', fontSize: '12px' }}></i>
                            AI agent processing…
                          </div>
                        )}

                        {chainDone && (
                          <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--green-glow)' }}>
                            <i className="fa-solid fa-circle-check"></i>
                            Chain complete — work order created and confirmation sent.
                          </div>
                        )}

                        <div ref={threadEndRef} />
                      </div>

                      {showReplyBox && (
                        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-reply" style={{ color: 'var(--violet-glow)' }}></i>
                            Resident reply — provide the missing information
                          </span>
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            rows={4}
                            placeholder="Type the resident's reply with the missing details..."
                            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                          />
                          <button type="button" onClick={sendReply} disabled={chainProcessing || !replyText.trim()}
                            style={sendBtnStyle(chainProcessing || !replyText.trim())}>
                            <i className="fa-solid fa-paper-plane"></i> Send Reply
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="transcript-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="erp-card scrollable-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 className="erp-card-title" style={{ marginBottom: '16px' }}>
                  <i className="fa-solid fa-microchip"></i> AI Extraction Results
                </h3>

                {processingState === 'idle' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-robot" style={{ fontSize: '32px', color: 'var(--cyan-glow)', marginBottom: '12px' }}></i>
                    <strong style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '6px' }}>Awaiting email</strong>
                    <p style={{ fontSize: '11.5px', maxWidth: '260px', lineHeight: 1.5, opacity: 0.7 }}>
                      Compose an email in the Email Chain tab or click an item in the Live Inbox.
                    </p>
                  </div>
                )}

                {processingState === 'processing' && (
                  <div className="processing-state" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="processing-orb"><i className="fa-solid fa-brain"></i><div className="processing-ring"></div></div>
                    <div className="processing-steps">
                      {[
                        { label: 'Parsing email content', icon: 'fa-envelope-open' },
                        { label: 'Matching customer profile', icon: 'fa-database' },
                        { label: 'LLM extraction', icon: 'fa-robot' },
                        { label: 'Creating work order', icon: 'fa-receipt' },
                      ].map((step, idx) => (
                        <div key={step.label} className={`proc-step${idx < processingStep ? ' done' : idx === processingStep ? ' active' : ''}`}>
                          <i className={`fa-solid ${step.icon}`}></i> {step.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {processingState === 'error' && (
                  <div className="extraction-error" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <i className="fa-solid fa-circle-xmark"></i>
                    <span>{errorMsg}</span>
                  </div>
                )}

                {processingState === 'success' && extractionResult && (
                  <div className="extraction-success">
                    <div className="extraction-header">
                      <div className="extraction-header-left">
                        <div className="extraction-check-icon"><i className="fa-solid fa-circle-check"></i></div>
                        <div>
                          <strong>
                            {residentName ? `${residentName} — ` : ''}
                            Work Order {extractionResult.work_order?.id}
                          </strong>
                          <div className="extraction-meta-badges">
                            {customerMatched
                              ? <span className="ef-match-badge ef-match-known"><i className="fa-solid fa-database"></i> Known Customer</span>
                              : <span className="ef-match-badge ef-match-new"><i className="fa-solid fa-user-plus"></i> New Customer</span>}
                            <span className="ef-parse-badge">
                              <i className={`fa-solid ${parsingMethod === 'llm' ? 'fa-robot' : 'fa-code'}`}></i>{' '}
                              {parsingMethod === 'llm' ? 'AI Agent' : 'Regex'}
                            </span>
                            <span className="ef-parse-badge"><i className="fa-solid fa-clock"></i> {elapsedTime}s</span>
                          </div>
                        </div>
                      </div>
                      <div className="urgency-tag" style={{
                        color: extractionResult.work_order?.urgency_level === 'Urgent' ? 'var(--red-glow)' : 'var(--green-glow)',
                        borderColor: extractionResult.work_order?.urgency_level === 'Urgent' ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)',
                        background: extractionResult.work_order?.urgency_level === 'Urgent' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      }}>
                        <i className={`fa-solid ${extractionResult.work_order?.urgency_level === 'Urgent' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>{' '}
                        {extractionResult.work_order?.urgency_level}
                      </div>
                    </div>

                    <div className="ef-section-label" style={{ marginTop: '16px' }}>
                      <i className="fa-solid fa-screwdriver-wrench"></i> Extracted Work Order
                    </div>
                    <div className="extraction-grid">
                      <div className="extraction-field extraction-field-full">
                        <div className="ef-label"><i className="fa-solid fa-location-dot"></i> Property</div>
                        <div className="ef-value">{extractionResult.work_order?.property_address || '—'}</div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-door-open"></i> Apartment</div>
                        <div className="ef-value">{extractionResult.work_order?.apartment_number || '—'}</div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-phone"></i> Contact</div>
                        <div className="ef-value">{extractionResult.work_order?.caller_phone_number || '—'}</div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-key"></i> Master Key</div>
                        <div className="ef-value">
                          {extractionResult.work_order?.permit_master_key
                            ? <span className="ef-tag ef-tag-green"><i className="fa-solid fa-check"></i> YES</span>
                            : <span className="ef-tag ef-tag-red"><i className="fa-solid fa-xmark"></i> NO</span>}
                        </div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-user-gear"></i> Technician</div>
                        <div className="ef-value">{extractionResult.work_order?.technician || '—'}</div>
                      </div>
                      {residentLanguage && (
                        <div className="extraction-field">
                          <div className="ef-label"><i className="fa-solid fa-language"></i> Language</div>
                          <div className="ef-value">{residentLanguage}</div>
                        </div>
                      )}
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-calendar-clock"></i> Scheduled</div>
                        <div className="ef-value">{extractionResult.work_order?.scheduled_time || '—'}</div>
                      </div>
                      <div className="extraction-field extraction-field-full">
                        <div className="ef-label"><i className="fa-solid fa-screwdriver-wrench"></i> Issue</div>
                        <div className="ef-value">{extractionResult.work_order?.issue_description || '—'}</div>
                      </div>
                      {extractionResult.work_order?.special_notes && (
                        <div className="extraction-field extraction-field-full">
                          <div className="ef-label"><i className="fa-solid fa-note-sticky"></i> Notes</div>
                          <div className="ef-value">{extractionResult.work_order.special_notes}</div>
                        </div>
                      )}
                    </div>

                    {!!extractionResult.extraction_report?.needs_followup && (
                      <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)', fontSize: '11.5px', color: 'var(--cyan-glow)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <i className="fa-solid fa-circle-info" style={{ marginTop: '1px', flexShrink: 0 }}></i>
                        <span>Missing info detected — system sent a follow-up request. Reply in the thread to complete the work order.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Settings drawer ── */}
        {settingsOpen && (
          <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="settings-panel" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  <i className="fa-solid fa-gear" style={{ marginRight: '8px', color: 'var(--text-muted)' }}></i>
                  Settings
                </h2>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  style={{ background: 'var(--bg-muted)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              {/* Connection status */}
              <div className="erp-card" style={{ marginBottom: '16px' }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-tower-broadcast"></i> Connection
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green-glow)' }} />
                  <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Live</span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Last synced: {lastSynced ? lastSynced.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                </div>
                <button
                  type="button"
                  onClick={fetchInbox}
                  style={{
                    marginTop: '10px', width: '100%', padding: '9px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer', background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-light)',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-arrows-rotate"></i> Refresh Now
                </button>
              </div>

              {/* Auto-refresh */}
              <div className="erp-card">
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-clock-rotate-left"></i> Auto-Refresh
                </h3>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '5px' }}>
                  Inbox polling interval
                </label>
                <select
                  value={pollIntervalSec}
                  onChange={e => setPollIntervalSec(Number(e.target.value))}
                  style={{
                    width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)',
                    borderRadius: '8px', padding: '8px 12px', fontSize: '12px', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  <option value={15}>Every 15 seconds</option>
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 60 seconds</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
