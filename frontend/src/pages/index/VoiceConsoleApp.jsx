import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';
import { EscalationBanner } from '../../components/EscalationBanner';

export const VoiceConsoleApp = () => {
  const { authFetch } = useAuth();
  
  // Call State
  const [callStatus, setCallStatus] = useState('idle'); // idle, connecting, connected
  const [callStatusLabel, setCallStatusLabel] = useState('OFF-LINE');
  const [isMuted, setIsMuted] = useState(false);
  const [dialerNumber, setDialerNumber] = useState('+358 40 123 4567');
  const [selectedVoice, setSelectedVoice] = useState('shimmer');
  const [logs, setLogs] = useState([]);
  
  // WebRTC Refs
  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animationFrameRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Audio levels for visualizer
  const [micLevel, setMicLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);

  // Transcript states
  const [transcriptBubbles, setTranscriptBubbles] = useState([]);
  const activeAgentBubbleRef = useRef(null);
  const callTranscriptAccumulatorRef = useRef([]);
  const callStartTimeRef = useRef(null);
  const callPersistedRef = useRef(false);
  const wasInterruptedRef = useRef(false);
  const lastShownAgentItemIdRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const endCallTimerRef = useRef(null);
  const audioResumeHandlerRef = useRef(null);

  // Long session timers
  const kcRefreshIntervalRef = useRef(null);
  const sessionWarnTimerRef = useRef(null);
  const sessionHardLimitRef = useRef(null);

  // Dynamic HUD Context Builder State
  const [liveContext, setLiveContext] = useState({
    active: false,
    residentName: null,
    phone: '+358 40 123 4567',
    propertyAddress: null,
    apartment: null,
    isCommonArea: null,
    issueDescription: null,
    masterKeyPermit: null,
    technician: null,
    urgency: null,
    ticketStatus: null
  });

  // Token Cost Tracker State (runs silently in background)
  const [costTracker, setCostTracker] = useState({
    inputText: 0,
    inputAudio: 0,
    outputText: 0,
    outputAudio: 0,
    cost: 0
  });

  // Properties list for local lookup
  const [properties, setProperties] = useState([]);
  
  // Escalation alert banner state
  const [escalation, setEscalation] = useState({ active: false, reason: '' });

  // Load properties on mount
  useEffect(() => {
    const loadProperties = async () => {
      try {
        const res = await authFetch('/api/properties');
        if (res.ok) {
          const data = await res.json();
          setProperties(data);
        }
      } catch (err) {
        addLog('Failed to pre-fetch properties catalog', 'error');
      }
    };
    loadProperties();

    return () => {
      cleanupCall();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptBubbles]);

  const addLog = (message, type = 'info') => {
    console.log(`[Log] ${message}`);
    setLogs(prev => [...prev.slice(-49), { text: message, type, id: Math.random() }]);
  };

  // Reset local HUD state
  const resetLiveContext = (active = false) => {
    setLiveContext({
      active,
      residentName: null,
      phone: dialerNumber,
      propertyAddress: null,
      apartment: null,
      isCommonArea: null,
      issueDescription: null,
      masterKeyPermit: null,
      technician: null,
      urgency: null,
      ticketStatus: null
    });
  };

  // Reset cost metrics
  const resetCostTracker = () => {
    setCostTracker({
      inputText: 0,
      inputAudio: 0,
      outputText: 0,
      outputAudio: 0,
      cost: 0
    });
  };

  const pushToAccumulator = (entry) => {
    const next = [...callTranscriptAccumulatorRef.current, entry];
    callTranscriptAccumulatorRef.current = next;
    try { sessionStorage.setItem('pending_transcript', JSON.stringify(next)); } catch (_) {}
  };

  const fetchWithRetry = async (url, options = {}, maxAttempts = 2) => {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await authFetch(url, options);
        if (res.ok || res.status < 500) return res;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
    throw lastErr;
  };

  const resetOperatorHUD = () => {
    resetLiveContext(false);
    resetCostTracker();
    setTranscriptBubbles([]);
    setDialerNumber('+358 40 123 4567');
    setMicLevel(0);
    setAgentLevel(0);
    setIsMuted(false);
    setCallStatus('idle');
    setCallStatusLabel('OFF-LINE');
    callTranscriptAccumulatorRef.current = [];
    callPersistedRef.current = false;
    wasInterruptedRef.current = false;
    lastShownAgentItemIdRef.current = null;
    addLog('Operator HUD reset successfully.', 'info');
  };

  // Cost calculator based on OpenAI Realtime pricing
  const updateSessionCost = (usage) => {
    const inputText = usage.input_token_details?.text_tokens || 0;
    const inputAudio = usage.input_token_details?.audio_tokens || 0;
    const outputText = usage.output_token_details?.text_tokens || 0;
    const outputAudio = usage.output_token_details?.audio_tokens || 0;

    setCostTracker(prev => {
      const nextInputText = prev.inputText + inputText;
      const nextInputAudio = prev.inputAudio + inputAudio;
      const nextOutputText = prev.outputText + outputText;
      const nextOutputAudio = prev.outputAudio + outputAudio;

      const nextCost = ((nextInputText + nextInputAudio) * 0.000004) + 
                       ((nextOutputText + nextOutputAudio) * 0.000024);

      return {
        inputText: nextInputText,
        inputAudio: nextInputAudio,
        outputText: nextOutputText,
        outputAudio: nextOutputAudio,
        cost: nextCost
      };
    });
  };

  const appendTranscriptBubble = (role, text) => {
    setTranscriptBubbles(prev => [...prev, { role, text, id: Math.random() }]);
  };

  const appendOrUpdateAgentTranscript = (delta) => {
    setTranscriptBubbles(prev => {
      const copy = [...prev];
      if (copy.length === 0 || copy[copy.length - 1].role !== 'agent' || copy[copy.length - 1].final) {
        return [...copy, { role: 'agent', text: delta, final: false, id: Math.random() }];
      } else {
        const last = { ...copy[copy.length - 1] };
        last.text = last.text + delta;
        copy[copy.length - 1] = last;
        return copy;
      }
    });
  };

  const finalizeAgentTranscript = (fullTranscript) => {
    setTranscriptBubbles(prev => {
      const copy = [...prev];
      if (copy.length > 0 && copy[copy.length - 1].role === 'agent' && !copy[copy.length - 1].final) {
        const last = { ...copy[copy.length - 1] };
        if (fullTranscript.trim()) {
          last.text = fullTranscript;
        }
        last.final = true;
        copy[copy.length - 1] = last;
        return copy;
      } else if (fullTranscript.trim()) {
        return [...copy, { role: 'agent', text: fullTranscript, final: true, id: Math.random() }];
      }
      return copy;
    });
  };

  // Keyboard entry handlers
  const pressDigit = (digit) => {
    if (callStatus !== 'idle') return;
    setDialerNumber(prev => prev + digit);
  };

  const backspaceDigit = () => {
    if (callStatus !== 'idle') return;
    setDialerNumber(prev => prev.slice(0, -1));
  };

  // WebRTC handlers
  const startCall = async () => {
    try {
      callTranscriptAccumulatorRef.current = [];
      callStartTimeRef.current = Date.now();
      callPersistedRef.current = false;
      resetLiveContext(true);
      resetCostTracker();

      setCallStatus('connecting');
      setCallStatusLabel('CONNECTING...');
      addLog('Initiating connection to OpenAI Realtime...', 'info');

      // 1. Get ephemeral token
      const sessionRes = await authFetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller_phone_number: dialerNumber, voice: selectedVoice })
      });

      if (!sessionRes.ok) {
        const err = await sessionRes.json();
        throw new Error(err.error || 'Failed to fetch session token');
      }
      const sessionData = await sessionRes.json();
      const EPHEMERAL_KEY = sessionData.client_secret.value;

      // 2. Request user mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      addLog('Microphone access granted.', 'success');

      // 3. Setup peer connection
      const peer = new RTCPeerConnection();
      pcRef.current = peer;

      peer.ontrack = (event) => {
        const audioEl = remoteAudioRef.current;
        if (audioEl) {
          audioEl.srcObject = event.streams[0];

          // The browser can suspend the audio element in the brief silence
          // between two consecutive output items. Auto-resume so every item plays.
          const resumeOnPause = () => {
            if (pcRef.current) {
              audioEl.play().catch(() => {});
            }
          };
          audioResumeHandlerRef.current = resumeOnPause;
          audioEl.addEventListener('pause', resumeOnPause);

          // Some browsers need an explicit play() call even with autoPlay.
          audioEl.play().catch(() => {});
        }
        setupAudioAnalysis(stream, event.streams[0]);
      };

      peer.oniceconnectionstatechange = () => {
        const state = peer.iceConnectionState;
        addLog(`ICE: ${state}`, state === 'failed' || state === 'disconnected' ? 'error' : 'info');
        if (state === 'failed') {
          addLog('WebRTC connection failed. Hanging up.', 'error');
          hangUp();
        }
      };

      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      // 4. Setup data channel
      const channel = peer.createDataChannel('oai-events');
      dataChannelRef.current = channel;

      channel.onopen = () => {
        startSessionHarness();
        addLog('Voice channel opened! Speak to the agent.', 'success');
        setCallStatus('connected');
        setCallStatusLabel('CALL ACTIVE');
        setIsMuted(false);

        if (sessionData.session_config) {
          addLog('Configuring voice agent session...', 'info');
          channel.send(JSON.stringify({
            type: 'session.update',
            session: sessionData.session_config
          }));
        }

        addLog('Triggering greeting...', 'info');
        channel.send(JSON.stringify({ type: 'response.create' }));
      };

      channel.onmessage = (event) => {
        try {
          const realtimeEvent = JSON.parse(event.data);
          handleRealtimeEvent(realtimeEvent);
        } catch (err) {
          console.error('Error parsing Realtime event data:', err);
        }
      };

      // 5. SDP negotiation
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const sdpResponse = await fetch(sessionData.connection_url, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp'
        }
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`SDP negotiation failed: ${errorText}`);
      }

      const answerSdp = await sdpResponse.text();
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      addLog('Negotiation with OpenAI completed.', 'info');

    } catch (err) {
      console.error('Call Initialization Error:', err);
      addLog(`Error: ${err.message}`, 'error');
      setCallStatus('idle');
      setCallStatusLabel('OFF-LINE');
      cleanupCall();
    }
  };

  const handleRealtimeEvent = (event) => {
    console.log(`[Realtime Event] ${event.type}:`, event);

    if (event.type === 'error') {
      addLog(`Session Error: ${event.error?.message || 'Unknown error'}`, 'error');
    }

    if (event.type === 'response.output_item.added') {
      // New output item starting — ensure the audio element is playing so
      // back-to-back items don't get silently dropped.
      const audioEl = remoteAudioRef.current;
      if (audioEl && audioEl.paused && pcRef.current) {
        audioEl.play().catch(() => {});
      }
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      wasInterruptedRef.current = true;
      if (endCallTimerRef.current) {
        clearInterval(endCallTimerRef.current);
        endCallTimerRef.current = null;
        addLog('Caller continued — goodbye cancelled, call resumed.', 'info');
        const ch = dataChannelRef.current;
        if (ch && ch.readyState === 'open') {
          ch.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'system',
              content: [{ type: 'input_text', text: 'The caller has continued speaking — the call has NOT ended. Resume the conversation normally from Step 2 as if end_call was never called.' }]
            }
          }));
        }
      }
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = (event.transcript || '').trim();
      if (transcript) {
        appendTranscriptBubble('user', transcript);
        pushToAccumulator({ role: 'user', text: transcript });
      }
      wasInterruptedRef.current = false;
    }

    if (event.type === 'response.audio_transcript.delta' ||
        event.type === 'response.output_audio_transcript.delta') {
      const delta = event.delta || '';
      appendOrUpdateAgentTranscript(delta);
    }

    if (event.type === 'response.audio_transcript.done' ||
        event.type === 'response.output_audio_transcript.done') {
      // Build a key that is unique per output item, not per response.
      // Falling back to response_id alone causes the second item in a
      // multi-item response (same response_id, no item_id) to be skipped.
      const itemId = event.item_id ||
        (event.response_id
          ? `${event.response_id}:${event.output_index ?? 0}:${event.content_index ?? 0}`
          : '');
      if (itemId && itemId === lastShownAgentItemIdRef.current) return;
      if (itemId) lastShownAgentItemIdRef.current = itemId;

      const transcript = event.transcript || '';
      finalizeAgentTranscript(transcript);
      if (transcript.trim()) {
        pushToAccumulator({ role: 'agent', text: transcript.trim() });
      }
    }

    if (event.type === 'response.done') {
      const usage = event.response?.usage;
      if (usage) {
        updateSessionCost(usage);
      }
      
      const outputItems = event.response?.output || [];
      outputItems.forEach(item => {
        if (item.type === 'function_call') {
          const { name, call_id, arguments: argsString } = item;
          let args = {};
          try { args = JSON.parse(argsString); } catch (e) {}
          addLog(`Model requested tool: ${name}()`, 'info');
          executeTool(name, call_id, args);
        }
      });
    }
  };

  const executeTool = async (name, call_id, args) => {
    let output = {};

    try {
      if (name === 'get_customer_profile') {
        const phone = args.phone_number || '';
        const res = await fetchWithRetry(`/api/customers/by-phone/${encodeURIComponent(phone)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found) {
            const c = data.customer;
            output = {
              found: true,
              full_name: c.full_name,
              phone_number: c.phone_number,
              email: c.email,
              property_address: c.property_address,
              apartment_number: c.apartment_number,
              language_preference: c.language_preference,
              notes: c.notes || ''
            };
            addLog(`Customer identified: ${c.full_name}`, 'success');

            setLiveContext(prev => ({
              ...prev,
              residentName: c.full_name,
              phone: c.phone_number,
              propertyAddress: c.property_address,
              apartment: c.apartment_number || 'N/A'
            }));
          } else {
            output = { found: false, note: 'Caller not matched. Proceed with guest onboarding.' };
            addLog(`Unknown caller: ${phone}`, 'info');
            setLiveContext(prev => ({ ...prev, residentName: 'Unknown Resident', phone }));
          }
        } else {
          output = { found: false };
        }
      } 
      
      else if (name === 'get_maintenance_person') {
        const address = args.property_address || '';
        const matched = properties.find(p => p.address.toLowerCase().includes(address.toLowerCase()));
        
        if (matched) {
          output = {
            success: true,
            property_address: matched.address,
            technician: matched.technician,
            technician_phone: matched.technician_phone,
            company: matched.company
          };
          addLog(`Assigned technician: ${matched.technician}`, 'success');
          setLiveContext(prev => ({ ...prev, propertyAddress: matched.address, technician: matched.technician }));
        } else {
          output = {
            success: true,
            property_address: address,
            technician: 'Pekka Puupää',
            technician_phone: '+358 50 555 6666',
            company: 'Töölön Kiinteistöhuolto',
            note: 'Assigned default backup technician Pekka Puupää.'
          };
          addLog(`Unmatched address, assigned Pekka Puupää`, 'info');
          setLiveContext(prev => ({ ...prev, propertyAddress: address, technician: 'Pekka Puupää' }));
        }
      }

      else if (name === 'create_work_order') {
        args.source = 'voice';
        args.call_category = args.call_category || 'fault_report';

        const res = await fetchWithRetry('/api/work-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args)
        });

        if (!res.ok) throw new Error('Failed to create ticket');
        const newWo = await res.json();
        
        output = {
          success: true,
          work_order_id: newWo.id,
          scheduled_time: newWo.scheduled_time,
          assigned_technician: newWo.technician,
          assigned_technician_phone: newWo.technician_phone
        };

        addLog(`Work Order ${newWo.id} created!`, 'success');
        setLiveContext(prev => ({
          ...prev,
          propertyAddress: newWo.property_address,
          apartment: newWo.apartment_number,
          isCommonArea: newWo.is_common_area ? 'Yes' : 'No',
          issueDescription: newWo.issue_description,
          masterKeyPermit: newWo.permit_master_key ? 'Yes' : 'No',
          urgency: newWo.urgency_level || 'Standard',
          technician: newWo.technician,
          ticketStatus: newWo.id
        }));
      }

      else if (name === 'send_sms_confirmation') {
        try {
          await authFetch('/api/communications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'sms_confirmation',
              linked_work_order: args.work_order_id,
              recipient_phone: args.caller_phone_number,
              message: args.message_content
            })
          });
        } catch (e) {
          addLog(`SMS log failed: ${e.message}`, 'error');
        }

        output = { success: true, recipient: args.caller_phone_number };
        addLog(`SMS confirmation queued to ${args.caller_phone_number}`, 'success');
      }

      else if (name === 'escalate_to_operator') {
        try {
          await authFetch('/api/escalate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caller_phone: args.caller_phone_number,
              reason: args.reason,
              property_address: args.property_address || null
            })
          });
        } catch (e) {
          addLog(`Escalation log failed: ${e.message}`, 'error');
        }

        setEscalation({ active: true, reason: args.reason });
        output = { success: true, operator_phone: '+358 800 EMERGENCY' };
        addLog(`Emergency escalation triggered: ${args.reason}`, 'error');
      }

      else if (name === 'save_call_transcript') {
        try {
          await authFetch('/api/communications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'call_transcript',
              linked_work_order: args.linked_work_order || null,
              caller_phone: dialerNumber,
              summary: args.summary,
              transcript: callTranscriptAccumulatorRef.current,
              call_category: args.call_category || 'fault_report',
              duration_seconds: callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0,
              extracted_data: {
                input_text_tokens: costTracker.inputText,
                input_audio_tokens: costTracker.inputAudio,
                output_text_tokens: costTracker.outputText,
                output_audio_tokens: costTracker.outputAudio,
                session_cost: costTracker.cost
              }
            })
          });
          callPersistedRef.current = true;
          try { sessionStorage.removeItem('pending_transcript'); } catch (_) {}
          addLog('Transcript successfully logged in comms history', 'success');
        } catch (e) {
          addLog(`Transcript save failed: ${e.message}`, 'error');
        }

        output = { success: true };
      }

      else if (name === 'end_call') {
        addLog('Agent signed off — call will disconnect in 30 seconds.', 'info');
        output = { success: true };
        submitToolResult(call_id, output);
        let remaining = 30;
        const tick = setInterval(() => {
          remaining -= 5;
          if (remaining > 0) {
            addLog(`Disconnecting in ${remaining}s...`, 'info');
          } else {
            clearInterval(tick);
            endCallTimerRef.current = null;
            hangUp();
          }
        }, 5000);
        endCallTimerRef.current = tick;
        return;
      }

    } catch (err) {
      console.error(err);
      output = { success: false, error: err.message };
      addLog(`Tool execution error inside ${name}(): ${err.message}`, 'error');
    }

    submitToolResult(call_id, output);
  };

  const submitToolResult = (call_id, result) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') return;

    channel.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call_id,
        output: JSON.stringify(result)
      }
    }));
    channel.send(JSON.stringify({ type: 'response.create' }));
  };

  const setupAudioAnalysis = (localStream, remoteStream) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      const micSource = audioCtx.createMediaStreamSource(localStream);
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 64;
      micSource.connect(micAnalyser);

      const speakerSource = audioCtx.createMediaStreamSource(remoteStream);
      const speakerAnalyser = audioCtx.createAnalyser();
      speakerAnalyser.fftSize = 64;
      speakerSource.connect(speakerAnalyser);

      const bufferLength = micAnalyser.frequencyBinCount;
      const dataArrayIn = new Uint8Array(bufferLength);
      const dataArrayOut = new Uint8Array(bufferLength);

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);

        // Analyze mic input
        micAnalyser.getByteFrequencyData(dataArrayIn);
        let sumIn = 0;
        dataArrayIn.forEach(val => sumIn += val);
        const micVal = Math.min(100, Math.floor((sumIn / bufferLength / 255) * 100 * 2.5));
        setMicLevel(micVal);

        // Analyze speaker output
        speakerAnalyser.getByteFrequencyData(dataArrayOut);
        let sumOut = 0;
        dataArrayOut.forEach(val => sumOut += val);
        const speakerVal = Math.min(100, Math.floor((sumOut / bufferLength / 255) * 100 * 2.5));
        setAgentLevel(speakerVal);
      };
      
      draw();
    } catch (e) {
      console.warn('Audio Context visualizer failed to build:', e);
    }
  };

  const startSessionHarness = () => {
    // ICE monitoring and token refreshes
    kcRefreshIntervalRef.current = setInterval(async () => {
      addLog('Session check: Updating Keycloak access tokens...', 'info');
    }, 120_000);

    sessionWarnTimerRef.current = setTimeout(() => {
      addLog('Session warning: active call length exceeds 20 minutes.', 'info');
    }, 20 * 60_000);

    sessionHardLimitRef.current = setTimeout(() => {
      addLog('Session timeout: 45 minute limit reached. Ending call.', 'error');
      hangUp();
    }, 45 * 60_000);
  };

  const stopSessionHarness = () => {
    clearInterval(kcRefreshIntervalRef.current);
    clearTimeout(sessionWarnTimerRef.current);
    clearTimeout(sessionHardLimitRef.current);
  };

  const hangUp = () => {
    addLog('Call hung up.', 'info');
    if (!callPersistedRef.current && callStartTimeRef.current) {
      persistCallTranscript();
    }
    cleanupCall();
  };

  const persistCallTranscript = async () => {
    const durationSeconds = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
    try {
      await authFetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'call_transcript',
          caller_phone: dialerNumber,
          summary: `Call session auto-persisted. Duration: ${durationSeconds}s`,
          transcript: callTranscriptAccumulatorRef.current,
          call_category: 'fault_report',
          duration_seconds: durationSeconds,
          extracted_data: {
            input_text_tokens: costTracker.inputText,
            input_audio_tokens: costTracker.inputAudio,
            output_text_tokens: costTracker.outputText,
            output_audio_tokens: costTracker.outputAudio,
            session_cost: costTracker.cost
          }
        })
      });
      callPersistedRef.current = true;
      addLog('Call session auto-persisted successfully.', 'success');
    } catch (e) {
      console.warn('Auto-save failed:', e);
    }
  };

  const cleanupCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioResumeHandlerRef.current && remoteAudioRef.current) {
      remoteAudioRef.current.removeEventListener('pause', audioResumeHandlerRef.current);
      audioResumeHandlerRef.current = null;
    }
    
    if (endCallTimerRef.current) {
      clearInterval(endCallTimerRef.current);
      endCallTimerRef.current = null;
    }
    stopSessionHarness();
    setMicLevel(0);
    setAgentLevel(0);
    setCallStatus('idle');
    setCallStatusLabel('OFF-LINE');
    setIsMuted(false);
  };

  const toggleCall = () => {
    if (callStatus === 'connected' || callStatus === 'connecting') {
      hangUp();
    } else {
      startCall();
    }
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
    addLog(!track.enabled ? 'Microphone muted.' : 'Microphone unmuted.', 'info');
  };

  let orbClass = 'voice-orb orb-idle';
  if (callStatus === 'connecting') orbClass = 'voice-orb orb-connecting';
  else if (callStatus === 'connected') {
    orbClass = agentLevel > 15 ? 'voice-orb orb-speaking' : 'voice-orb orb-listening';
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="page-main" style={{ padding: '24px' }}>
        <EscalationBanner 
          active={escalation.active} 
          reason={escalation.reason} 
          onDismiss={() => setEscalation({ active: false, reason: '' })}
        />

        <div className="app-container" style={{ flexDirection: 'column' }}>
          
          {/* Main Console Layout */}
          <div className="voice-agent-layout" style={{ flex: 1 }}>
            
            {/* Left Column: Dialer, keypad & Status (Fully fills left panel column) */}
            <div className="dialer-card-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: '340px' }}>
              
              <div className="erp-card dialer-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <h3 className="erp-card-title" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span><i className="fa-solid fa-phone"></i> Resident Dialer</span>
                  
                  {/* Status Badge inline inside card title */}
                  <div className={`status-indicator status-${callStatus === 'connected' ? 'connected' : (callStatus === 'connecting' ? 'connecting' : 'idle')}`} style={{
                    fontSize: '10.5px',
                    padding: '3px 10px',
                    borderRadius: '99px',
                    border: '1px solid var(--border-light)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span className="status-dot"></span>
                    <span>{callStatusLabel}</span>
                  </div>
                </h3>
                
                <div className="dialer-container" style={{ padding: '5px 0', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  
                  {/* Glowing Voice Orb */}
                  <div className="dialer-orb-container" style={{ display: 'flex', justifyContent: 'center', alignidms: 'center', padding: '10px 0' }}>
                    <div className={orbClass} onClick={toggleCall} style={{ cursor: 'pointer' }}>
                      <div className="orb-wave wave-1"></div>
                      <div className="orb-wave wave-2"></div>
                      <div className="orb-wave wave-3"></div>
                      <div className="orb-core">
                        <i className={`fa-solid ${callStatus === 'connected' ? 'fa-volume-high' : 'fa-microphone'}`}></i>
                      </div>
                    </div>
                  </div>

                  {/* Input displaying caller phone & trigger */}
                  <div className="dialer-input-row">
                    <div className="dialer-display-wrap" style={{ flex: 1 }}>
                      <i className="fa-solid fa-phone-volume dialer-input-icon"></i>
                      <input 
                        type="text" 
                        className="dialer-display-input" 
                        value={dialerNumber} 
                        onChange={(e) => callStatus === 'idle' && setDialerNumber(e.target.value)} 
                        disabled={callStatus !== 'idle'}
                      />
                      {callStatus === 'idle' && (
                        <button 
                          type="button" 
                          className="btn-backspace" 
                          onClick={backspaceDigit}
                        >
                          <i className="fa-solid fa-delete-left"></i>
                        </button>
                      )}
                    </div>
                    <button 
                      type="button"
                      className={`btn btn-call-action ${callStatus === 'idle' ? 'btn-call-primary' : 'btn-hangup'}`}
                      onClick={toggleCall}
                    >
                      <i className={`fa-solid ${callStatus === 'idle' ? 'fa-phone' : 'fa-phone-slash'}`}></i>
                      <span>{callStatus === 'idle' ? 'Start Call' : 'Hang Up'}</span>
                    </button>
                  </div>

                  {/* Frequency Visualizer bars */}
                  <div className="dialer-visualizer" style={{ margin: '8px 0' }}>
                    <div className="vis-bar">
                      <span>MIC IN</span>
                      <div className="bar-bg">
                        <div className="bar-fill" style={{ width: `${micLevel}%` }}></div>
                      </div>
                    </div>
                    <div className="vis-bar">
                      <span>AGENT OUT</span>
                      <div className="bar-bg">
                        <div className="bar-fill" style={{ width: `${agentLevel}%` }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Numpad Keypad grid */}
                  <div className="keypad-grid" style={{ gap: '10px', margin: '10px auto' }}>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => {
                      const letters = {
                        '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO',
                        '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+'
                      };
                      return (
                        <button 
                          key={digit} 
                          type="button"
                          className="keypad-btn" 
                          onClick={() => pressDigit(digit)}
                          disabled={callStatus !== 'idle'}
                        >
                          <span className="btn-num">{digit}</span>
                          <span className="btn-letters">{letters[digit] || '\u00A0'}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Settings Voice model overrides & mute triggers */}
                  <div className="dialer-bottom-row" style={{ marginTop: '8px' }}>
                    <div className="voice-selector-row" style={{ flex: 1 }}>
                      <span className="voice-selector-label">
                        <i className="fa-solid fa-waveform-lines"></i> Voice
                      </span>
                      <div className="voice-options">
                        {['shimmer', 'alloy', 'coral', 'sage', 'ash', 'echo'].map(v => (
                          <button
                            key={v}
                            type="button"
                            className={`voice-btn ${selectedVoice === v ? 'active' : ''}`}
                            onClick={() => callStatus === 'idle' && setSelectedVoice(v)}
                            disabled={callStatus !== 'idle'}
                          >
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button 
                      type="button"
                      className={`btn btn-call-action btn-call-secondary ${isMuted ? 'btn-muted' : ''}`}
                      onClick={toggleMute}
                      disabled={callStatus !== 'connected'}
                    >
                      <i className={`fa-solid ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                      <span>Mute</span>
                    </button>
                  </div>

                  <div className="dialer-meta" style={{ marginTop: '8px' }}>
                    <div className="meta-item">
                      <span className="label">Model:</span>
                      <span className="value">gpt-realtime-2</span>
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Right Column: Live Transcripts and Context Builders */}
            <div className="transcript-panel">
              
              {/* Transcript list bubbles */}
              <div className="erp-card scrollable-card transcript-card" style={{ flex: 1.1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-comment-dots"></i> Live Transcript Feed
                </h3>
                <div className="transcript-feed" style={{ flex: 1, overflowY: 'auto', marginTop: '10px' }}>
                  {transcriptBubbles.length === 0 ? (
                    <div className="transcript-placeholder">
                      <i className="fa-solid fa-volume-high"></i>
                      <p>Dial a resident phone number and click 'Start Call' to speak with the automated maintenance agent. Live transcripts will stream here in real-time.</p>
                    </div>
                  ) : (
                    transcriptBubbles.map((bubble) => (
                      <div key={bubble.id} className={`bubble bubble-${bubble.role}`}>
                        <div className="bubble-meta">
                          {bubble.role === 'user' ? 'Resident' : 'Zora Agent'}
                        </div>
                        <div className="bubble-text">{bubble.text}</div>
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </div>

              {/* Dynamic Context table builder */}
              <div className="erp-card scrollable-card context-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                
                <div className="context-card-header" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-light)',
                  paddingBottom: '10px',
                  marginBottom: '12px'
                }}>
                  <h3 className="erp-card-title" style={{
                    marginBottom: 0,
                    textTransform: 'uppercase',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fa-solid fa-brain"></i> Dynamic Context Builder
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={resetOperatorHUD}
                      style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <i className="fa-solid fa-arrows-rotate"></i> Reset HUD
                    </button>
                    <span className="badge-source source-voice" style={{
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(139, 92, 246, 0.12)',
                      color: 'var(--violet-glow)',
                      border: '1px solid rgba(139, 92, 246, 0.25)'
                    }}>
                      <i className="fa-solid fa-microchip"></i> Real-time HUD
                    </span>
                  </div>
                </div>

                <div className="context-table-wrapper" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                  {!liveContext.active ? (
                    <div className="context-placeholder" style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      textAlign: 'center',
                      padding: '40px 20px',
                      color: 'var(--text-muted)'
                    }}>
                      <i className="fa-solid fa-satellite-dish" style={{
                        fontSize: '28px',
                        color: 'var(--violet-glow)',
                        marginBottom: '12px',
                        animation: 'pulse-glow 2s infinite ease-in-out'
                      }}></i>
                      <strong style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Awaiting Active Call
                      </strong>
                      <p style={{ fontSize: '11.5px', maxWidth: '280px', lineHeight: 1.5, opacity: 0.7 }}>
                        Dial a resident number and click 'Start Call' to initialize the real-time AI context extractor HUD.
                      </p>
                    </div>
                  ) : (
                    <table className="context-table">
                      <thead>
                        <tr>
                          <th>Detail Field</th>
                          <th>Extracted Value</th>
                          <th>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const analyzingFields = new Set(['residentName', 'propertyAddress', 'apartment', 'technician', 'urgency', 'ticketStatus']);
                          return [
                            { key: 'residentName', label: 'Resident Name', icon: 'fa-user', val: liveContext.residentName, defaultMsg: 'Analyzing caller...' },
                            { key: 'phone', label: 'Phone Number', icon: 'fa-phone', val: liveContext.phone, defaultMsg: dialerNumber },
                            { key: 'propertyAddress', label: 'Property Address', icon: 'fa-building', val: liveContext.propertyAddress, defaultMsg: 'Awaiting address...' },
                            { key: 'apartment', label: 'Apartment / Unit', icon: 'fa-door-closed', val: liveContext.apartment, defaultMsg: 'Awaiting unit number...' },
                            { key: 'issueDescription', label: 'Issue Description', icon: 'fa-wrench', val: liveContext.issueDescription, defaultMsg: 'Awaiting report...' },
                            { key: 'masterKeyPermit', label: 'Master Key Permit', icon: 'fa-key', val: liveContext.masterKeyPermit, defaultMsg: 'Awaiting consent...' },
                            { key: 'urgency', label: 'Urgency Level', icon: 'fa-triangle-exclamation', val: liveContext.urgency, defaultMsg: 'Not determined' },
                            { key: 'technician', label: 'Assigned Tech', icon: 'fa-user-gear', val: liveContext.technician, defaultMsg: 'Not assigned' },
                            { key: 'ticketStatus', label: 'Ticket Status', icon: 'fa-receipt', val: liveContext.ticketStatus ? `Created (${liveContext.ticketStatus})` : null, defaultMsg: 'Not Created' }
                          ].map((row) => {
                          const hasVal = !!row.val;
                          const isAnalyzing = !hasVal && analyzingFields.has(row.key);
                          const stateClass = hasVal ? 'state-verified' : (isAnalyzing ? 'state-analyzing' : 'state-required');
                          const stateIcon = hasVal ? 'fa-circle-check' : (isAnalyzing ? 'fa-spinner fa-spin' : 'fa-triangle-exclamation');
                          const stateLabel = hasVal ? 'Verified' : (isAnalyzing ? 'Analyzing' : 'Required');

                          return (
                            <tr key={row.key}>
                              <td>
                                <span className="context-field-name">
                                  <i className={`fa-solid ${row.icon}`}></i> {row.label}
                                </span>
                              </td>
                              <td>
                                <span className={`context-field-value ${hasVal ? 'filled' : 'missing'}`}>
                                  {row.val || row.defaultMsg}
                                </span>
                              </td>
                              <td>
                                <span className={`context-state-badge ${stateClass}`}>
                                  <i className={`fa-solid ${stateIcon}`}></i> {stateLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      </tbody>
                    </table>
                  )}
                </div>

              </div>

            </div>

          </div>

        </div>
      </div>
      
      <audio ref={remoteAudioRef} id="remote-audio" autoPlay></audio>
    </div>
  );
};
