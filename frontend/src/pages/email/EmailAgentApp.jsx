import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';

export const EmailAgentApp = () => {
  const { authFetch } = useAuth();

  // Simulation Inbox state
  const initialSimulatedEmails = [
    {
      id: 'sim-1',
      from: 'mikko.korhonen@outlook.com',
      subject: 'Emergency: Radiator leaking hot water',
      body: 'Hello, this is Mikko Korhonen from Mannerheimintie 10, Apartment A4. My living room radiator is leaking hot water onto the wooden floor. It is dripping rapidly, about a cup every minute. Please send a technician immediately! Phone: +358 40 555 1212. I permit master key access.',
      infoLevel: 'Full Info',
      infoPct: '100%',
      status: 'unprocessed',
      workOrderId: null
    },
    {
      id: 'sim-2',
      from: 'liisa.virtanen@gmail.com',
      subject: 'Kitchen sink faucet dripping',
      body: 'Hi. The faucet in my kitchen has been dripping for a few days. It is not urgent but quite annoying. I am in Liisankatu 18, Apt 12. Let me know when someone can visit. Thanks, Liisa.',
      infoLevel: 'Partial Info (No Phone)',
      infoPct: '70%',
      status: 'unprocessed',
      workOrderId: null
    },
    {
      id: 'sim-3',
      from: 'anonymous.resident@helsinki.fi',
      subject: 'Broken light in the laundry room',
      body: 'The main ceiling light in the common laundry room at Hämeentie 23 is completely dead. It flickered yesterday and now won\'t turn on at all. This is a common area, so no apartment keys are needed. Please fix it.',
      infoLevel: 'Partial Info (No Name/Phone)',
      infoPct: '50%',
      status: 'unprocessed',
      workOrderId: null
    },
    {
      id: 'sim-4',
      from: 'pekka.nieminen@yahoo.com',
      subject: 'URGENT: Locked out of my apartment!',
      body: 'Help! I just stepped out to take the trash and the door slammed shut. My keys are inside. I am Pekka Nieminen, living at Runeberginkatu 45, Apartment B18. My phone number is +358 50 999 8877. I need a door opening service, please. I have my ID with me.',
      infoLevel: 'Full Info',
      infoPct: '100%',
      status: 'unprocessed',
      workOrderId: null
    },
    {
      id: 'sim-5',
      from: 'unknown.resident@mail.com',
      subject: 'problem in bathroom',
      body: 'There is something wrong with the toilet flush, it keeps running. Please fix. I live in Apt C9.',
      infoLevel: 'Minimal Info (No Name/Addr/Phone)',
      infoPct: '20%',
      status: 'unprocessed',
      workOrderId: null
    }
  ];

  const [simulatedEmails, setSimulatedEmails] = useState(initialSimulatedEmails);
  const [activeTab, setActiveTab] = useState('simulation'); // 'simulation' or 'manual'
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState(null);

  // Form State
  const [emailFrom, setEmailFrom] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [formFlash, setFormFlash] = useState(false);

  // Sender Lookup States
  const [resolvedCustomer, setResolvedCustomer] = useState(null);
  const [lookupState, setLookupState] = useState('idle'); // idle, loading, found, unknown
  const lookupDebounceRef = useRef(null);

  // Submission / Loading States
  const [processingState, setProcessingState] = useState('idle'); // idle, processing, success, error
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [extractionResult, setExtractionResult] = useState(null);
  const [elapsedTime, setElapsedTime] = useState('0.0');

  // Templates & Processed Log
  const [templates, setTemplates] = useState([]);
  const [recentProcessed, setRecentProcessed] = useState([]);

  useEffect(() => {
    loadTemplates();
    loadRecentProcessed();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await authFetch('/api/email-templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load templates', err);
    }
  };

  const loadRecentProcessed = async () => {
    try {
      const res = await authFetch('/api/communications?type=email_intake&limit=10');
      if (res.ok) {
        const data = await res.json();
        setRecentProcessed(data);
      }
    } catch (err) {
      console.error('Failed to load recent log', err);
    }
  };

  // Debounced sender lookup
  const handleFromInput = (e) => {
    const val = e.target.value;
    setEmailFrom(val);
    
    setResolvedCustomer(null);
    setLookupState('idle');
    clearTimeout(lookupDebounceRef.current);

    if (!val.includes('@') || val.trim().length < 5) return;

    setLookupState('loading');
    lookupDebounceRef.current = setTimeout(() => {
      performSenderLookup(val.trim());
    }, 500);
  };

  const performSenderLookup = async (email) => {
    try {
      const res = await authFetch(`/api/customers/by-email/${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          setResolvedCustomer(data.customer);
          setLookupState('found');
        } else {
          setResolvedCustomer(null);
          setLookupState('unknown');
        }
      } else {
        setResolvedCustomer(null);
        setLookupState('unknown');
      }
    } catch (e) {
      setResolvedCustomer(null);
      setLookupState('idle');
    }
  };

  // Click Template
  const selectTemplate = (tpl) => {
    setEmailFrom(tpl.from || '');
    setEmailSubject(tpl.subject || '');
    setEmailBody(tpl.body || '');
    setFormFlash(true);
    setTimeout(() => setFormFlash(false), 700);

    if (tpl.from) {
      setLookupState('loading');
      performSenderLookup(tpl.from);
    }
  };

  // Reset Simulation
  const handleResetSimulation = () => {
    setSimulatedEmails(initialSimulatedEmails);
    setSelectedEmailId(null);
    setProcessingState('idle');
    setExtractionResult(null);
  };

  // Click single email card in list
  const selectEmailCard = (email) => {
    setSelectedEmailId(email.id);
    if (email.status === 'processed' && email.extractionResult) {
      setExtractionResult(email.extractionResult);
      setElapsedTime(email.elapsedTime || '1.2');
      setProcessingState('success');
    } else {
      // Load current active values into custom composer
      setEmailFrom(email.from);
      setEmailSubject(email.subject);
      setEmailBody(email.body);
      
      // Perform customer lookup
      setResolvedCustomer(null);
      setLookupState('idle');
      if (email.from) {
        setLookupState('loading');
        performSenderLookup(email.from);
      }
      
      // Set right side to idle so they can click "Process with AI" to start
      setProcessingState('idle');
      setExtractionResult(null);
    }
  };

  // Process a single simulated email with the backend
  const processSingleEmail = async (emailId) => {
    const email = simulatedEmails.find(e => e.id === emailId);
    if (!email) return;

    // Set card status to processing
    setSimulatedEmails(prev => prev.map(e => e.id === emailId ? { ...e, status: 'processing' } : e));
    setSelectedEmailId(emailId);
    
    // Set right panel feedback
    setProcessingState('processing');
    setProcessingStep(0);
    const startTime = Date.now();

    // Visual step updater
    const stepInterval = setInterval(() => {
      setProcessingStep(prev => {
        if (prev < 3) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 600);

    try {
      const res = await authFetch('/api/email-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: email.from,
          subject: email.subject,
          body: email.body
        })
      });

      clearInterval(stepInterval);

      if (res.ok) {
        const data = await res.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        setElapsedTime(elapsed);
        setExtractionResult(data);
        setProcessingState('success');

        // Update list state
        const woId = data.work_order?.id || 'Done';
        setSimulatedEmails(prev => prev.map(e => e.id === emailId ? { 
          ...e, 
          status: 'processed', 
          workOrderId: woId,
          extractionResult: data,
          elapsedTime: elapsed
        } : e));

        // Prepend to feed
        if (data.communication) {
          setRecentProcessed(prev => [data.communication, ...prev.slice(0, 9)]);
        }
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Email LLM ingestion failed.');
        setProcessingState('error');
        setSimulatedEmails(prev => prev.map(e => e.id === emailId ? { ...e, status: 'error' } : e));
      }
    } catch (err) {
      clearInterval(stepInterval);
      setErrorMsg(`Network Ingestion failed: ${err.message}`);
      setProcessingState('error');
      setSimulatedEmails(prev => prev.map(e => e.id === emailId ? { ...e, status: 'error' } : e));
    }
  };

  // Process a single email triggered by its list button
  const handleProcessSingle = async (emailId) => {
    if (bulkProcessing) return;
    await processSingleEmail(emailId);
  };

  // Process all unprocessed simulated emails sequentially
  const handleProcessAllUnprocessed = async () => {
    if (bulkProcessing) return;
    setBulkProcessing(true);

    const unprocessed = simulatedEmails.filter(e => e.status === 'unprocessed');
    for (const email of unprocessed) {
      await processSingleEmail(email.id);
      // Wait 1.5 seconds between processing to let user watch the simulation flow
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    setBulkProcessing(false);
  };

  // Submit manual custom email
  const handleSubmitEmail = async (e) => {
    e.preventDefault();
    if (!emailFrom.trim() || !emailSubject.trim() || !emailBody.trim()) return;

    setProcessingState('processing');
    setProcessingStep(0);
    const startTime = Date.now();

    const stepInterval = setInterval(() => {
      setProcessingStep(prev => {
        if (prev < 3) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 800);

    try {
      const res = await authFetch('/api/email-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: emailFrom.trim(),
          subject: emailSubject.trim(),
          body: emailBody.trim()
        })
      });

      clearInterval(stepInterval);

      if (res.ok) {
        const data = await res.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        setElapsedTime(elapsed);
        setExtractionResult(data);
        setProcessingState('success');

        // Reset inputs
        setEmailFrom('');
        setEmailSubject('');
        setEmailBody('');
        setLookupState('idle');
        setResolvedCustomer(null);

        // Prepend to feed
        if (data.communication) {
          setRecentProcessed(prev => [data.communication, ...prev.slice(0, 9)]);
        }
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Email LLM ingestion failed.');
        setProcessingState('error');
      }
    } catch (err) {
      clearInterval(stepInterval);
      setErrorMsg(`Network ingestion failed: ${err.message}`);
      setProcessingState('error');
    }
  };

  const getInitials = (name) => {
    return name ? name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?';
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="page-main" style={{ padding: '24px' }}>
        <div className="app-container" style={{ flexDirection: 'column' }}>
          
          <div className="email-agent-layout" style={{ flex: 1, minHeight: 0 }}>
            
            {/* Left Column: Intake Email Form / Simulation Panel */}
            <div className="erp-card scrollable-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 className="erp-card-title" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-square-envelope"></i> Simulated Intake Inboxes
                </span>
                
                {/* Status Indicator inline */}
                <div className="status-indicator status-connected" style={{
                  fontSize: '10.5px',
                  padding: '3px 10px',
                  borderRadius: '99px',
                  border: '1px solid var(--border-light)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span className="status-dot"></span>
                  <span>AI Agent Ready</span>
                </div>
              </h3>

              {/* Simulation vs Manual tab selectors */}
              <div className="simulation-tabs" style={{ display: 'flex', gap: '4px', background: 'var(--bg-muted, #f3f4f6)', padding: '4px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border-light)' }}>
                <button 
                  type="button"
                  onClick={() => setActiveTab('simulation')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    border: 'none',
                    background: activeTab === 'simulation' ? 'var(--bg-card, #ffffff)' : 'transparent',
                    color: activeTab === 'simulation' ? 'var(--text-primary, #111111)' : 'var(--text-muted, #6b7280)',
                    fontWeight: activeTab === 'simulation' ? 'bold' : 'normal',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: activeTab === 'simulation' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                  }}
                >
                  <i className="fa-solid fa-satellite-dish"></i> Simulated Inbox
                </button>
                <button 
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    border: 'none',
                    background: activeTab === 'manual' ? 'var(--bg-card, #ffffff)' : 'transparent',
                    color: activeTab === 'manual' ? 'var(--text-primary, #111111)' : 'var(--text-muted, #6b7280)',
                    fontWeight: activeTab === 'manual' ? 'bold' : 'normal',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: activeTab === 'manual' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                  }}
                >
                  <i className="fa-solid fa-pen-to-square"></i> Compose Custom
                </button>
              </div>

              {activeTab === 'simulation' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {simulatedEmails.filter(e => e.status === 'unprocessed').length} unprocessed emails in queue
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleResetSimulation}
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer' }}
                        disabled={bulkProcessing}
                      >
                        <i className="fa-solid fa-arrows-rotate"></i> Reset
                      </button>
                      <button
                        type="button"
                        onClick={handleProcessAllUnprocessed}
                        disabled={bulkProcessing || simulatedEmails.filter(e => e.status === 'unprocessed').length === 0}
                        className="btn btn-call-primary"
                        style={{ 
                          fontSize: '11px', 
                          padding: '4px 12px', 
                          borderRadius: '8px', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          cursor: 'pointer', 
                          background: 'linear-gradient(135deg, var(--cyan-glow), var(--violet-glow))', 
                          border: 'none', 
                          color: '#fff' 
                        }}
                      >
                        {bulkProcessing ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin"></i> Processing All...
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-envelopes-bulk"></i> Process All
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="simulated-emails-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    {simulatedEmails.map(email => {
                      const isSelected = selectedEmailId === email.id;
                      const infoPctColor = email.infoLevel.includes('Full') 
                        ? 'var(--green-glow, #22c55e)' 
                        : email.infoLevel.includes('Partial') 
                          ? 'var(--cyan-glow, #06b6d4)' 
                          : 'var(--red-glow, #ef4444)';
                      
                      let statusBadge = (
                        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                          Unprocessed
                        </span>
                      );
                      if (email.status === 'processing') {
                        statusBadge = (
                          <span className="pulse-glow" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--violet-glow)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                            <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '4px' }}></i> Processing...
                          </span>
                        );
                      } else if (email.status === 'processed') {
                        statusBadge = (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--green-glow)', border: '1px solid rgba(34, 197, 94, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <i className="fa-solid fa-circle-check"></i> {email.workOrderId}
                          </span>
                        );
                      } else if (email.status === 'error') {
                        statusBadge = (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--red-glow)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            Failed
                          </span>
                        );
                      }

                      return (
                        <div 
                          key={email.id} 
                          onClick={() => selectEmailCard(email)}
                          style={{
                            padding: '16px',
                            borderRadius: '12px',
                            border: isSelected ? '1px solid var(--violet-glow)' : '1px solid var(--border-light)',
                            background: isSelected ? 'var(--bg-muted, #f3f4f6)' : 'var(--bg-card, #ffffff)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            position: 'relative'
                          }}
                          className="simulated-email-card"
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {email.from}
                              </span>
                              <strong style={{ fontSize: '13px', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {email.subject}
                              </strong>
                            </div>
                            {statusBadge}
                          </div>

                          <p style={{ fontSize: '12px', lineHeight: '1.5', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {email.body}
                          </p>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '8px',
                                background: 'rgba(0, 0, 0, 0.02)',
                                border: `1px solid ${infoPctColor}`,
                                color: infoPctColor
                              }}>
                                {email.infoLevel} ({email.infoPct})
                              </span>
                            </div>

                            {email.status === 'unprocessed' && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleProcessSingle(email.id); }}
                                disabled={bulkProcessing}
                                className="btn-email-template"
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  border: '1px solid var(--violet-glow)',
                                  color: 'var(--violet-glow)',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <i className="fa-solid fa-robot"></i> Process with AI
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                  {/* Quick templates board */}
                  <div>
                    <span className="voice-selector-label" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      QUICK EMAIL TEMPLATES
                    </span>
                    <div className="email-template-buttons" id="email-template-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {templates.map(tpl => (
                        <button 
                          key={tpl.id} 
                          type="button" 
                          className="btn-email-template"
                          onClick={() => selectTemplate(tpl)}
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Composer Inputs Form */}
                  <form id="email-form" className={formFlash ? 'template-loaded' : ''} onSubmit={handleSubmitEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label htmlFor="email-from" className="voice-selector-label" style={{ fontSize: '11.5px' }}>From (Sender Address)</label>
                      <div className="dialer-display-wrap" style={{ margin: 0 }}>
                        <i className="fa-solid fa-at dialer-input-icon"></i>
                        <input 
                          type="email" 
                          id="email-from" 
                          className="dialer-display-input"
                          style={{ fontSize: '13.5px', fontFamily: 'JetBrains Mono' }}
                          placeholder="resident.name@email.fi" 
                          value={emailFrom}
                          onChange={handleFromInput}
                          required
                        />
                      </div>
                    </div>

                    {/* Inline Sender lookup card */}
                    {lookupState !== 'idle' && (
                      <div className="sender-info-card visible" style={{ animation: 'fade-in 0.3s ease' }}>
                        {lookupState === 'loading' && (
                          <div className="sender-loading" style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px', color: 'var(--violet-glow)' }}></i> Looking up sender...
                          </div>
                        )}
                        
                        {lookupState === 'found' && resolvedCustomer && (
                          <div className="sender-card-inner sender-known">
                            <div className="sender-avatar-wrap">
                              <div className="sender-avatar">{getInitials(resolvedCustomer.full_name)}</div>
                              <span className="sender-badge-known"><i className="fa-solid fa-circle-check"></i> Known Resident</span>
                            </div>
                            <div className="sender-info-grid">
                              <div className="sender-info-row"><i className="fa-solid fa-user"></i><span>{resolvedCustomer.full_name}</span></div>
                              <div className="sender-info-row"><i className="fa-solid fa-phone"></i><span>{resolvedCustomer.phone_number}</span></div>
                              <div className="sender-info-row"><i className="fa-solid fa-location-dot"></i><span>{resolvedCustomer.property_address}</span></div>
                              <div className="sender-info-row"><i className="fa-solid fa-door-open"></i><span>Apt {resolvedCustomer.apartment_number || 'N/A'}</span></div>
                              {resolvedCustomer.language_preference && (
                                <div className="sender-info-row"><i className="fa-solid fa-globe"></i><span>{resolvedCustomer.language_preference}</span></div>
                              )}
                              {resolvedCustomer.notes && (
                                <div className="sender-info-row sender-notes"><i className="fa-solid fa-note-sticky"></i><span>{resolvedCustomer.notes}</span></div>
                              )}
                            </div>
                            <div className="sender-hint"><i className="fa-solid fa-bolt"></i> Address & apartment will be pre-filled by the AI from their profile.</div>
                          </div>
                        )}

                        {lookupState === 'unknown' && (
                          <div className="sender-card-inner sender-unknown">
                            <div className="sender-avatar-wrap">
                              <div className="sender-avatar sender-avatar-unknown"><i className="fa-solid fa-user-question"></i></div>
                              <span className="sender-badge-unknown"><i className="fa-solid fa-circle-exclamation"></i> Unknown Sender</span>
                            </div>
                            <div className="sender-unknown-msg">
                              <p>No customer record found for <strong>{emailFrom}</strong>.</p>
                              <p>The AI agent will attempt to extract their details from the email content. If a name and phone number are found, a new customer record will be <strong>auto-created</strong>.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label htmlFor="email-subject" className="voice-selector-label" style={{ fontSize: '11.5px' }}>Subject Header</label>
                      <div className="dialer-display-wrap" style={{ margin: 0 }}>
                        <i className="fa-solid fa-pen-fancy dialer-input-icon"></i>
                        <input 
                          type="text" 
                          id="email-subject" 
                          className="dialer-display-input"
                          style={{ fontSize: '13.5px' }}
                          placeholder="e.g., Radiator broken" 
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label htmlFor="email-body" className="voice-selector-label" style={{ fontSize: '11.5px' }}>Email Content Body</label>
                      <textarea 
                          id="email-body" 
                          className="dialer-display-input" 
                          style={{
                            height: '100%',
                            minHeight: '140px',
                            resize: 'none',
                            borderRadius: '12px',
                            padding: '12px 14px',
                            fontSize: '12.5px',
                            lineHeight: '1.6'
                          }}
                          placeholder="Write or load template email text..."
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          required
                        />
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-call-primary" 
                      id="btn-submit-email"
                      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '14px', flex: 'none' }}
                      disabled={processingState === 'processing'}
                    >
                      {processingState === 'processing' ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i>
                          <span>Processing with AI Ingestion...</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-robot"></i>
                          <span>Process with AI Email Agent</span>
                        </>
                      )}
                    </button>

                  </form>
                </div>
              )}

            </div>

            {/* Right Column: Progressive Loaders, Extraction reports & logs */}
            <div className="transcript-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Upper panel: extraction result card */}
              <div className="erp-card scrollable-card" id="email-results" style={{ flex: 1.3, display: 'flex', flexDirection: 'column' }}>
                <h3 className="erp-card-title" style={{ marginBottom: '16px' }}>
                  <i className="fa-solid fa-microchip"></i> AI Extraction Results
                </h3>

                {processingState === 'idle' && (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'var(--text-muted)'
                  }}>
                    <i className="fa-solid fa-robot" style={{ fontSize: '32px', color: 'var(--cyan-glow)', marginBottom: '12px' }}></i>
                    <strong style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '6px' }}>
                      Awaiting AI Ingestion
                    </strong>
                    <p style={{ fontSize: '11.5px', maxWidth: '280px', lineHeight: 1.5, opacity: 0.7 }}>
                      Submit a template email or input custom body text and trigger processing to view the structured extraction report.
                    </p>
                  </div>
                )}

                {processingState === 'processing' && (
                  <div className="processing-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifycontent: 'center' }}>
                    <div className="processing-orb">
                      <i className="fa-solid fa-brain"></i>
                      <div className="processing-ring"></div>
                    </div>
                    <div className="processing-steps">
                      {[
                        { label: 'Parsing email content', icon: 'fa-envelope-open' },
                        { label: 'Matching customer profile', icon: 'fa-database' },
                        { label: 'LLM extraction', icon: 'fa-robot' },
                        { label: 'Creating work order', icon: 'fa-receipt' }
                      ].map((step, idx) => {
                        let stepClass = 'proc-step';
                        if (idx < processingStep) stepClass = 'proc-step done';
                        else if (idx === processingStep) stepClass = 'proc-step active';
                        
                        return (
                          <div key={step.label} className={stepClass}>
                            <i className={`fa-solid ${step.icon}`}></i> {step.label}
                          </div>
                        );
                      })}
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
                  <div className="extraction-success" style={{ animation: 'fade-in 0.3s ease' }}>
                    <div className="extraction-header">
                      <div className="extraction-header-left">
                        <div className="extraction-check-icon"><i className="fa-solid fa-circle-check"></i></div>
                        <div>
                          <strong>Work Order {extractionResult.work_order?.id} Created</strong>
                          <div className="extraction-meta-badges">
                            {extractionResult.customer_matched ? (
                              <span className="ef-match-badge ef-match-known"><i className="fa-solid fa-database"></i> Matched Customer</span>
                            ) : (
                              <span className="ef-match-badge ef-match-new"><i className="fa-solid fa-user-plus"></i> New Customer</span>
                            )}
                            <span className="ef-parse-badge">
                              <i className={`fa-solid ${extractionResult.parsing_method === 'llm' ? 'fa-robot' : 'fa-code'}`}></i> {extractionResult.parsing_method === 'llm' ? 'AI Agent' : 'Regex Fallback'}
                            </span>
                            <span className="ef-parse-badge"><i className="fa-solid fa-clock"></i> {elapsedTime}s</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="urgency-tag" style={{
                        color: extractionResult.work_order?.urgency_level === 'Urgent' ? 'var(--red-glow)' : 'var(--green-glow)',
                        borderColor: extractionResult.work_order?.urgency_level === 'Urgent' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)',
                        background: extractionResult.work_order?.urgency_level === 'Urgent' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'
                      }}>
                        <i className={`fa-solid ${extractionResult.work_order?.urgency_level === 'Urgent' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i> {extractionResult.work_order?.urgency_level}
                      </div>
                    </div>

                    {extractionResult.known_customer ? (
                      <div className="ef-customer-profile">
                        <div className="ef-section-label"><i className="fa-solid fa-user-check"></i> Matched Resident Profile</div>
                        <div className="ef-customer-row">
                          <div className="ef-customer-avatar">{getInitials(extractionResult.known_customer.full_name)}</div>
                          <div>
                            <div className="ef-customer-name">{extractionResult.known_customer.full_name}</div>
                            <div className="ef-customer-sub">{extractionResult.known_customer.phone_number} · {extractionResult.known_customer.email}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      extractionResult.extraction_report?.resident_name && (
                        <div className="ef-customer-profile ef-customer-new">
                          <div className="ef-section-label"><i className="fa-solid fa-user-plus"></i> New Resident Extracted</div>
                          <div className="ef-customer-row">
                            <div className="ef-customer-avatar ef-customer-avatar-new"><i className="fa-solid fa-user"></i></div>
                            <div>
                              <div className="ef-customer-name">{extractionResult.extraction_report.resident_name}</div>
                              <div className="ef-customer-sub">{extractionResult.work_order?.caller_phone_number}</div>
                            </div>
                          </div>
                        </div>
                      )
                    )}

                    <div className="ef-section-label" style={{ marginTop: '16px' }}><i className="fa-solid fa-screwdriver-wrench"></i> Extracted Work Order Details</div>
                    <div className="extraction-grid">
                      <div className="extraction-field extraction-field-full">
                        <div className="ef-label"><i className="fa-solid fa-location-dot"></i> Property</div>
                        <div className="ef-value">{extractionResult.work_order?.property_address}</div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-door-open"></i> Apartment</div>
                        <div className="ef-value">{extractionResult.work_order?.apartment_number}</div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-phone"></i> Contact</div>
                        <div className="ef-value">{extractionResult.work_order?.caller_phone_number}</div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-key"></i> Master Key</div>
                        <div className="ef-value">
                          {extractionResult.work_order?.permit_master_key ? (
                            <span className="ef-tag ef-tag-green"><i className="fa-solid fa-check"></i> YES</span>
                          ) : (
                            <span className="ef-tag ef-tag-red"><i className="fa-solid fa-xmark"></i> NO</span>
                          )}
                        </div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-user-gear"></i> Technician</div>
                        <div className="ef-value">{extractionResult.work_order?.technician}</div>
                      </div>
                      <div className="extraction-field">
                        <div className="ef-label"><i className="fa-solid fa-calendar-clock"></i> Scheduled</div>
                        <div className="ef-value">{extractionResult.work_order?.scheduled_time}</div>
                      </div>
                      <div className="extraction-field extraction-field-full">
                        <div className="ef-label"><i className="fa-solid fa-screwdriver-wrench"></i> Issue Description</div>
                        <div className="ef-value">{extractionResult.work_order?.issue_description}</div>
                      </div>
                      {extractionResult.work_order?.special_notes && (
                        <div className="extraction-field extraction-field-full">
                          <div className="ef-label"><i className="fa-solid fa-note-sticky"></i> Special Notes</div>
                          <div className="ef-value">{extractionResult.work_order.special_notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Lower panel: running feed lists */}
              <div className="erp-card" style={{ flex: 0.7, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h3 className="erp-card-title" style={{ marginBottom: '12px' }}>
                  <i className="fa-solid fa-clock-rotate-left"></i> Recently Processed Emails
                </h3>
                <div className="processed-emails-feed" id="processed-emails-feed" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentProcessed.length === 0 ? (
                    <div className="loading-placeholder" style={{ padding: '20px 0' }}>
                      <i className="fa-solid fa-inbox"></i>
                      <p>No processed emails found in log catalog.</p>
                    </div>
                  ) : (
                    recentProcessed.map(comm => {
                      const ex = comm.extracted_data || {};
                      const orig = comm.original_email || {};
                      const ts = new Date(comm.timestamp);

                      return (
                        <div key={comm.id} className="processed-email-entry" style={{ animation: 'fade-in 0.4s ease' }}>
                          <div className="pe-header">
                            <span className="pe-id"><i className="fa-solid fa-hashtag"></i>{comm.linked_work_order || 'N/A'}</span>
                            <span className="pe-time">{ts.toLocaleDateString('fi-FI')} {ts.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="pe-from"><i className="fa-solid fa-envelope"></i>{comm.sender_email || orig.from || ''}</div>
                          <div className="pe-issue">{ex.issue_description || orig.subject || ''}</div>
                          <div className="pe-address"><i className="fa-solid fa-location-dot"></i>{ex.property_address || comm.property_address || '—'}</div>
                          {comm.status && <span className={`pe-status pe-status-${comm.status}`}>{comm.status}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
