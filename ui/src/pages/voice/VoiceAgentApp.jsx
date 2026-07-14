import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';
import { useAgentConfig, LANGUAGE_LABELS, VOICE_BY_LANG } from '../../hooks/useAgentConfig';
import { useTranscript } from '../../hooks/useTranscript';
import { useLiveKitAgent } from '../../hooks/useLiveKitAgent';
import { AgentControls } from '../../components/agent/AgentControls';
import { TranscriptPanel } from '../../components/agent/TranscriptPanel';
import { CdbPanel } from '../../components/agent/CdbPanel';
import { FormPanel } from '../../components/agent/FormPanel';
import { RoomEvent, Track, Room } from 'livekit-client';

const S = {
  select: {
    width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)',
    border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '12px', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  },
  textarea: {
    width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)',
    border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', minHeight: '90px',
    outline: 'none', boxSizing: 'border-box',
  },
  label: {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '5px',
  },
  controlGroup: {
    display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px',
  },
};

export const VoiceAgentApp = () => {
  const { token, authFetch } = useAuth();
  const config = useAgentConfig();
  const transcript = useTranscript();
  const agentHook = useLiveKitAgent(authFetch, token);

  const { agents, setAgents, selectedId, setSelectedId, sessionState, setSessionState,
    muted, setMuted, micDevices, selectedMic, handleMicChange, micLabel, setMicLabel,
    error, setError, showError, roomRef, connectingRef, sessionGenRef, joinTimeoutRef,
    canvasRef, canvasSizeRef, startVisualizer, stopVisualizer, toggleMute } = agentHook;

  const [hangupConfirming, setHangupConfirming] = useState(false);
  const [collectedFields, setCollectedFields] = useState({});
  const [cdbCustomer, setCdbCustomer] = useState(null);
  const [cdbWorkOrder, setCdbWorkOrder] = useState(null);
  const [callerPhone, setCallerPhone] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [benchTurns, setBenchTurns] = useState([]);

  const sseRef = useRef(null);
  const sseTimerRef = useRef(null);
  const hangupConfirmTimerRef = useRef(null);
  const isSwitchingRef = useRef(false);
  const transcriptEndRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const loadBench = useCallback(async (id) => {
    if (!id) return;
    try {
      const res = await authFetch(`/bench/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setBenchTurns((data.turns || []).slice(-10));
    } catch (e) {
      console.error('Bench load error:', e);
    }
  }, [authFetch]);

  const clearMetrics = useCallback(async () => {
    if (!selectedId) return;
    try {
      await authFetch(`/bench/clear/${selectedId}`, { method: 'POST' });
      setBenchTurns([]);
    } catch (e) {
      console.error('Clear metrics error:', e);
    }
  }, [authFetch, selectedId]);

  const resetSessionUI = useCallback(() => {
    if (hangupConfirmTimerRef.current) {
      clearTimeout(hangupConfirmTimerRef.current);
      hangupConfirmTimerRef.current = null;
    }
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    setSessionState('idle');
    setMuted(false);
    setHangupConfirming(false);
    setMicLabel('Not connected');
    stopVisualizer();
    setCollectedFields({});
  }, [setMicLabel, stopVisualizer, setSessionState, setMuted, joinTimeoutRef]);

  const initStream = useCallback((tok) => {
    if (sseRef.current) sseRef.current.close();
    if (sseTimerRef.current) { clearTimeout(sseTimerRef.current); sseTimerRef.current = null; }

    const es = new EventSource(`/stream?token=${encodeURIComponent(tok)}`);
    sseRef.current = es;

    es.onmessage = (e) => {
      let line;
      try { line = JSON.parse(e.data); } catch { return; }

      if (line === '__STOPPED__') {
        if (connectingRef.current) return;
        if (roomRef.current) { try { roomRef.current.disconnect(); } catch {} roomRef.current = null; }
        connectingRef.current = false;
        setSessionState('idle');
        setMicLabel('Not connected');
        stopVisualizer();
        return;
      }

      const m = typeof line === 'string' && line.match(/^\[field\] ([^:]+): (.+)$/);
      if (m) {
        setCollectedFields(prev => ({ ...prev, [m[1].trim()]: m[2].trim() }));
      }

      const cm = typeof line === 'string' && line.match(/^\[customer\] (.+)$/);
      if (cm) { try { setCdbCustomer(JSON.parse(cm[1])); } catch {} }
      const wm = typeof line === 'string' && line.match(/^\[workorder\] (.+)$/);
      if (wm) { try { setCdbWorkOrder(JSON.parse(wm[1])); } catch {} }

      if (typeof line === 'string' && line.includes('Turn #')) {
        setTimeout(() => {
          const id = selectedIdRef.current;
          if (id) loadBench(id);
        }, 500);
      }
    };

    es.onerror = () => {
      sseTimerRef.current = setTimeout(() => initStream(tok), 5000);
    };
  }, [loadBench, setMicLabel, stopVisualizer, setSessionState, roomRef, connectingRef]);

  useEffect(() => {
    if (!token) return;
    initStream(token);
    return () => {
      if (sseRef.current) sseRef.current.close();
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
    };
  }, [token, initStream]);

  useEffect(() => {
    authFetch('/agents')
      .then(r => r.json())
      .then(data => {
        setAgents(data);
        const firstId = Object.keys(data)[0];
        if (firstId) {
          setSelectedId(firstId);
          loadBench(firstId);
        }
        return authFetch('/agent/status').then(r2 => r2.json()).then(status => {
          if (status.running && status.agent && !roomRef.current && !connectingRef.current) {
            setSelectedId(status.agent);
          }
        });
      })
      .catch(e => console.error('Agent load error:', e));
  }, [authFetch, loadBench, setAgents, setSelectedId, roomRef, connectingRef]);

  const joinRoom = useCallback(async (myGen) => {
    if (roomRef.current) return;
    try {
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const tokenRes = await authFetch('/token');
      const { token: lkToken, url: lkUrl } = await tokenRes.json();

      if (myGen !== undefined && sessionGenRef.current !== myGen) {
        try { room.disconnect(); } catch {}
        roomRef.current = null;
        return;
      }

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.attach();
          setMicLabel('Agent speaking');
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        if (roomRef.current) setMicLabel('Speak now');
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
        setMicLabel('Agent online — speak now');
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (roomRef.current) setMicLabel('Agent disconnected', true);
      });

      room.on(RoomEvent.TranscriptionReceived, (segs, participant) => {
        const isAgent = participant?.identity?.startsWith('agent') ?? false;
        segs.forEach(seg => {
          const text = seg.text.trim();
          if (!text) return;
          transcript.dispatchTranscript({ type: 'UPSERT', id: seg.id, text, final: seg.final, isAgent });
          if (seg.final && !isAgent && roomRef.current) {
            setMicLabel('Agent thinking', true);
          }
        });
      });

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        if (!isSwitchingRef.current) resetSessionUI();
      });

      await room.connect(lkUrl, lkToken, { autoSubscribe: true });
      if (!roomRef.current) { try { room.disconnect(); } catch {} return; }
      await room.localParticipant.setMicrophoneEnabled(true, { deviceId: selectedMic });
      if (!roomRef.current) { try { room.disconnect(); } catch {} return; }
      const localTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (localTrack) startVisualizer(new MediaStream([localTrack.mediaStreamTrack]));

      setSessionState('connected');
      setMicLabel(`Waiting for ${agents[selectedIdRef.current]?.label || 'agent'} to join`, true);

      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = setTimeout(() => {
        joinTimeoutRef.current = null;
        if (roomRef.current && roomRef.current.remoteParticipants.size === 0) {
          if (isSwitchingRef.current) return;
          try { roomRef.current.disconnect(); } catch {}
          roomRef.current = null;
          connectingRef.current = false;
          resetSessionUI();
          showError('The agent did not join in time. Please try starting the session again.');
        }
      }, 20000);
    } catch (e) {
      console.error('Join room error:', e);
      roomRef.current = null;
      resetSessionUI();
      showError('Connection error: ' + e.message);
    }
  }, [authFetch, selectedMic, agents, startVisualizer, resetSessionUI, setMicLabel, showError, transcript, roomRef, sessionGenRef, joinTimeoutRef, setSessionState, connectingRef]);

  const startSession = useCallback(async () => {
    if (roomRef.current || connectingRef.current) return;
    if (!selectedId) return;

    connectingRef.current = true;
    setSessionState('connecting');
    transcript.dispatchTranscript({ type: 'CLEAR' });
    setCollectedFields({});
    setCdbCustomer(null);
    setCdbWorkOrder(null);
    const myGen = ++sessionGenRef.current;
    setMicLabel(`Starting ${agents[selectedId]?.label || selectedId}`, true);

    try {
      const payload = {
        voice: config.voice,
        language: config.language,
        proactive: config.proactive,
      };
      if (config.configMode === 'simple') {
        payload.instructions = config.instructions;
      } else if (config.configMode === 'form') {
        payload.agent_config = config.parsedFormConfig;
      } else if (config.configMode === 'cdb') {
        payload.cdb_mode = true;
        if (callerPhone.trim()) payload.caller_phone = callerPhone.trim();
      }

      const startRes = await authFetch(`/agent/start/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const startData = await startRes.json();

      if (startData.error) {
        showError('Failed to start: ' + startData.error);
        resetSessionUI();
        return;
      }

      if (sessionGenRef.current !== myGen) return;
      setMicLabel('Connecting to room', true);
      await joinRoom(myGen);
    } catch (e) {
      showError('Connection error: ' + e.message);
      resetSessionUI();
    } finally {
      connectingRef.current = false;
    }
  }, [selectedId, agents, config, callerPhone, authFetch, joinRoom, resetSessionUI, setMicLabel, showError, roomRef, connectingRef, sessionGenRef, transcript, setSessionState]);

  const hangupSession = useCallback(async () => {
    if (!hangupConfirming) {
      setHangupConfirming(true);
      hangupConfirmTimerRef.current = setTimeout(() => {
        setHangupConfirming(false);
      }, 3000);
      return;
    }

    if (hangupConfirmTimerRef.current) {
      clearTimeout(hangupConfirmTimerRef.current);
      hangupConfirmTimerRef.current = null;
    }
    setHangupConfirming(false);
    connectingRef.current = false;
    if (roomRef.current) { try { await roomRef.current.disconnect(); } catch {} roomRef.current = null; }
    try { await authFetch('/agent/stop', { method: 'POST' }); } catch (e) { console.error('Stop agent error:', e); }
    resetSessionUI();
  }, [hangupConfirming, authFetch, resetSessionUI, connectingRef, roomRef]);

  const handleAgentSelect = useCallback(async (id) => {
    if (id === selectedId) return;
    const wasActive = roomRef.current !== null || connectingRef.current;
    setSelectedId(id);
    loadBench(id);

    if (wasActive) {
      const label = agents[id]?.label || id;
      setMicLabel(`Switching to ${label}`, true);
      isSwitchingRef.current = true;
      connectingRef.current = false;
      if (roomRef.current) { try { await roomRef.current.disconnect(); } catch {} roomRef.current = null; }
      try { await authFetch('/agent/stop', { method: 'POST' }); } catch {}
      isSwitchingRef.current = false;
    }
  }, [selectedId, agents, loadBench, setMicLabel, authFetch, roomRef, connectingRef, setSelectedId]);

  const prevSelectedRef = useRef(selectedId);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedId;
    if (prev !== selectedId && selectedId && sessionState !== 'idle') {
      startSession();
    }
  }, [selectedId, sessionState, startSession]);

  const isActive = sessionState !== 'idle';
  const isConnecting = sessionState === 'connecting';
  const isHandshaking = isConnecting || (sessionState === 'connected' && micLabel.startsWith('Waiting for'));
  const parsedFields = config.parsedFormConfig?.required_fields || [];
  const currentAgent = selectedId ? agents[selectedId] : null;
  const modeLabel = config.configMode === 'simple' ? 'Simple' : config.configMode === 'form' ? 'Form Mode' : 'Customer DB';
  const voiceOptions = VOICE_BY_LANG[config.language] || VOICE_BY_LANG['en-US'];
  
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="page-main voice-page-main" style={{ padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'rgba(239,68,68,0.08)',
            border: '1px solid var(--red-glow)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
            fontSize: '13px', color: 'var(--red-glow)', flexShrink: 0,
          }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'var(--red-glow)', cursor: 'pointer', fontSize: '14px', padding: 0, opacity: 0.7 }}>✕</button>
          </div>
        )}

        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: currentAgent?.color || 'var(--violet-glow)', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentAgent?.label || 'No agent selected'}
            </span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>· {modeLabel}</span>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
            fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', fontFamily: 'inherit',
          }}>
            <i className="fa-solid fa-gear"></i> Settings
          </button>
        </div>

        <div className="voice-layout" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {config.configMode === 'cdb' && (
            <div className="erp-card" style={{ flexShrink: 0, padding: '14px 16px' }}>
              <h3 className="erp-card-title" style={{ marginBottom: '8px' }}><i className="fa-solid fa-phone"></i> Caller ID</h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>Dial the number this call is coming from.</div>
              <input type="tel" value={callerPhone} onChange={e => setCallerPhone(e.target.value)} disabled={isActive} placeholder="e.g. +358 40 123 4567" style={{ ...S.select, cursor: 'text', opacity: isActive ? 0.5 : 1, fontFamily: 'JetBrains Mono, monospace', boxSizing: 'border-box' }} />
            </div>
          )}

          <div className="erp-card" style={{ height: '120px', flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 16px' }}>
            {isHandshaking ? (
              <div style={{ height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                {[0, 1, 2].map(i => <span key={i} style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--violet-glow)', animation: `voice-handshake-pulse 1.1s ${(i * 0.15).toFixed(2)}s ease-in-out infinite` }} />)}
              </div>
            ) : <canvas ref={canvasRef} aria-label="Audio visualizer" style={{ width: '100%', height: '70px', display: 'block' }} />}
            <div style={{ position: 'absolute', bottom: '8px', left: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>{micLabel}</div>
            <style>{`@keyframes voice-handshake-pulse { 0%, 100% { transform: scale(0.7); opacity: 0.4; } 50% { transform: scale(1.15); opacity: 1; } }`}</style>
          </div>

          <AgentControls 
            isActive={isActive} 
            isConnecting={isConnecting} 
            startDisabled={!selectedId || isConnecting || (config.configMode === 'cdb' && !callerPhone.trim())} 
            needsPhone={config.configMode === 'cdb' && !callerPhone.trim()} 
            startSession={startSession} 
            hangupSession={hangupSession} 
            hangupConfirming={hangupConfirming} 
            sessionState={sessionState} 
            toggleMute={toggleMute} 
            muted={muted} 
          />

          {config.configMode === 'form' && parsedFields.length > 0 && (
            <FormPanel parsedFields={parsedFields} collectedFields={collectedFields} />
          )}

          {config.configMode === 'cdb' && (
            <CdbPanel cdbCustomer={cdbCustomer} cdbWorkOrder={cdbWorkOrder} collectedFields={collectedFields} callerPhone={callerPhone} setCallerPhone={setCallerPhone} isActive={isActive} />
          )}

          <TranscriptPanel segments={transcript.segments} dispatchTranscript={transcript.dispatchTranscript} transcriptEndRef={transcriptEndRef} />
        </div>

        {settingsOpen && (
          <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="settings-panel" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}><i className="fa-solid fa-gear" style={{ marginRight: '8px', color: 'var(--text-muted)' }}></i>Settings</h2>
                <button type="button" onClick={() => setSettingsOpen(false)} style={{ background: 'var(--bg-muted)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="erp-card" style={{ marginBottom: '16px' }}>
                <h3 className="erp-card-title"><i className="fa-solid fa-robot"></i> Select Agent</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.keys(agents).length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>Loading agents…</div>}
                  {Object.entries(agents).map(([id, agent]) => {
                    const isSelected = id === selectedId;
                    return (
                      <button key={id} type="button" onClick={() => handleAgentSelect(id)} style={{ textAlign: 'left', padding: '12px', borderRadius: '10px', cursor: 'pointer', border: isSelected ? `1px solid ${agent.color || 'var(--violet-glow)'}` : '1px solid var(--border-light)', background: isSelected ? 'var(--bg-muted)' : 'var(--bg-card)', boxShadow: isSelected ? `0 0 0 2px ${agent.color || 'var(--violet-glow)'}22` : 'none', transition: 'all 0.15s', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}><span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: agent.color || 'var(--violet-glow)', display: 'inline-block', flexShrink: 0 }} />{agent.label}</span></div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>{agent.subtitle}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-muted)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>{agent.model}</span><span style={{ fontSize: '11.5px', fontWeight: 500, color: agent.color || 'var(--violet-glow)' }}>{agent.e2e_target} ms</span></div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="erp-card" style={{ marginBottom: '16px' }}>
                <h3 className="erp-card-title"><i className="fa-solid fa-sliders"></i> Call Settings</h3>
                <div style={S.controlGroup}><label style={S.label}>Language</label><select value={config.language} onChange={e => config.setLanguage(e.target.value)} disabled={isActive} style={{ ...S.select, opacity: isActive ? 0.5 : 1 }}>{LANGUAGE_LABELS.map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}</select></div>
                <div style={S.controlGroup}><label style={S.label}>Neural Voice</label><select value={config.voice} onChange={e => config.setVoice(e.target.value)} disabled={isActive} style={{ ...S.select, opacity: isActive ? 0.5 : 1 }}>{voiceOptions.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                <div style={S.controlGroup}><label style={S.label}>Microphone</label><select value={selectedMic} onChange={e => handleMicChange(e.target.value)} style={S.select}>{micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Default Microphone'}</option>)}</select></div>
                <div style={{ marginBottom: '4px' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 500, cursor: isActive ? 'not-allowed' : 'pointer' }}><input type="checkbox" checked={config.proactive} onChange={e => config.setProactive(e.target.checked)} disabled={isActive} style={{ width: '14px', height: '14px', accentColor: 'var(--violet-glow)', cursor: isActive ? 'not-allowed' : 'pointer' }} />Proactive mode (agent speaks first)</label></div>
              </div>

              <div className="erp-card" style={{ marginBottom: '16px' }}>
                <h3 className="erp-card-title"><i className="fa-solid fa-gear"></i> Agent Config</h3>
                <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '8px', padding: '3px', marginBottom: '12px', border: '1px solid var(--border-light)' }}>{['simple', 'form', 'cdb'].map(mode => <button key={mode} type="button" onClick={() => config.setConfigMode(mode)} style={{ flex: 1, padding: '6px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none', background: config.configMode === mode ? 'var(--bg-card)' : 'transparent', color: config.configMode === mode ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: config.configMode === mode ? 600 : 400, transition: 'all 0.15s', fontFamily: 'inherit', textTransform: 'capitalize' }}>{mode === 'simple' ? 'Simple' : mode === 'form' ? 'Form Mode' : 'Customer DB'}</button>)}</div>
                {config.configMode === 'simple' && <div><label style={S.label}>System Instructions</label><textarea value={config.instructions} onChange={e => config.setInstructions(e.target.value)} disabled={isActive} placeholder="Enter custom instructions for the agent…" style={{ ...S.textarea, opacity: isActive ? 0.5 : 1 }} /></div>}
                {config.configMode === 'form' && <div><label style={S.label}>JSON Schema (Fields to Collect)</label><textarea value={config.formJson} onChange={e => config.setFormJson(e.target.value)} disabled={isActive} placeholder="Enter JSON config schema…" style={{ ...S.textarea, opacity: isActive ? 0.5 : 1, fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }} />{config.formJsonError && <div style={{ fontSize: '11px', color: 'var(--red-glow)', marginTop: '4px', wordBreak: 'break-word' }}>{config.formJsonError}</div>}</div>}
                {config.configMode === 'cdb' && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>Dial a number in the Caller ID box on the main screen to match the caller instantly...</div>}
              </div>

              <div className="erp-card" style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><h3 className="erp-card-title" style={{ marginBottom: 0 }}><i className="fa-solid fa-gauge-high"></i> Latency Metrics</h3><button type="button" onClick={clearMetrics} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Clear</button></div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><tr>{['Turn', 'End-to-End', 'STT', 'Duration'].map(h => <th key={h} style={{ color: 'var(--text-muted)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>{h}</th>)}</tr></thead>
                  <tbody>{benchTurns.length === 0 ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}>No data yet.</td></tr> : benchTurns.map(t => {
                    const e2e = t.e2e_ms ? Math.round(t.e2e_ms) : null;
                    const stt = t.stt_ms ? Math.round(t.stt_ms) : null;
                    const dur = (t.response_done_ms && t.speech_stopped_ms) ? Math.round(t.response_done_ms - t.speech_stopped_ms) : null;
                    const barW = e2e ? Math.min(100, Math.round((e2e / 5500) * 100)) : 0;
                    const agentColor = (selectedId && agents[selectedId]?.color) || 'var(--violet-glow)';
                    return (
                      <tr key={t.turn}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-primary)' }}>{t.turn}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ background: 'var(--bg-muted)', height: '5px', borderRadius: '3px', flex: 1, maxWidth: '100px', overflow: 'hidden' }}><div style={{ width: `${barW}%`, height: '100%', borderRadius: '3px', background: agentColor, minWidth: '4px', transition: 'width 0.3s' }} /></div><span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{e2e !== null ? `${e2e} ms` : '—'}</span></div></td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{stt !== null ? `${stt} ms` : '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{dur !== null ? `${dur} ms` : '—'}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <style>{`@keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }`}</style>
      </div>
    </div>
  );
};
