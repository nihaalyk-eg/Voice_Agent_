import React, {
  useState, useEffect, useRef, useCallback, useReducer,
} from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';
import { usePersistedState } from '../../hooks/usePersistedState';

// ── Constants ────────────────────────────────────────────────────────────────

// Azure Speech STT + neural TTS voices, grouped by locale. Covers the major
// language families Azure supports rather than every regional variant.
const VOICE_BY_LANG = {
  'en-US': ['en-US-AvaNeural', 'en-US-JennyNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural', 'en-US-AndrewNeural', 'en-US-GuyNeural'],
  'en-GB': ['en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-GB-LibbyNeural'],
  'en-AU': ['en-AU-NatashaNeural', 'en-AU-WilliamNeural'],
  'en-IN': ['en-IN-NeerjaNeural', 'en-IN-PrabhatNeural'],
  'en-CA': ['en-CA-ClaraNeural', 'en-CA-LiamNeural'],
  'es-ES': ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
  'es-MX': ['es-MX-DaliaNeural', 'es-MX-JorgeNeural'],
  'fr-FR': ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
  'fr-CA': ['fr-CA-SylvieNeural', 'fr-CA-JeanNeural'],
  'de-DE': ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
  'it-IT': ['it-IT-ElsaNeural', 'it-IT-DiegoNeural'],
  'pt-BR': ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'],
  'pt-PT': ['pt-PT-RaquelNeural', 'pt-PT-DuarteNeural'],
  'nl-NL': ['nl-NL-ColetteNeural', 'nl-NL-MaartenNeural'],
  'ru-RU': ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'],
  'pl-PL': ['pl-PL-AgnieszkaNeural', 'pl-PL-MarekNeural'],
  'sv-SE': ['sv-SE-SofieNeural', 'sv-SE-MattiasNeural'],
  'nb-NO': ['nb-NO-IselinNeural', 'nb-NO-FinnNeural'],
  'da-DK': ['da-DK-ChristelNeural', 'da-DK-JeppeNeural'],
  'fi-FI': ['fi-FI-SelmaNeural', 'fi-FI-HarriNeural'],
  'el-GR': ['el-GR-AthinaNeural', 'el-GR-NestorasNeural'],
  'tr-TR': ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'],
  'cs-CZ': ['cs-CZ-VlastaNeural', 'cs-CZ-AntoninNeural'],
  'hu-HU': ['hu-HU-NoemiNeural', 'hu-HU-TamasNeural'],
  'ro-RO': ['ro-RO-AlinaNeural', 'ro-RO-EmilNeural'],
  'uk-UA': ['uk-UA-PolinaNeural', 'uk-UA-OstapNeural'],
  'ar-SA': ['ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'],
  'ar-EG': ['ar-EG-SalmaNeural', 'ar-EG-ShakirNeural'],
  'he-IL': ['he-IL-HilaNeural', 'he-IL-AvriNeural'],
  'hi-IN': ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
  'zh-CN': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
  'zh-TW': ['zh-TW-HsiaoChenNeural', 'zh-TW-YunJheNeural'],
  'zh-HK': ['zh-HK-HiuMaanNeural', 'zh-HK-WanLungNeural'],
  'ja-JP': ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
  'ko-KR': ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'],
  'vi-VN': ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'],
  'th-TH': ['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural'],
  'id-ID': ['id-ID-GadisNeural', 'id-ID-ArdiNeural'],
  'ms-MY': ['ms-MY-YasminNeural', 'ms-MY-OsmanNeural'],
  'fil-PH': ['fil-PH-BlessicaNeural', 'fil-PH-AngeloNeural'],
  'bn-IN': ['bn-IN-TanishaaNeural', 'bn-IN-BashkarNeural'],
  'ta-IN': ['ta-IN-PallaviNeural', 'ta-IN-ValluvarNeural'],
  'ur-PK': ['ur-PK-UzmaNeural', 'ur-PK-AsadNeural'],
  'fa-IR': ['fa-IR-DilaraNeural', 'fa-IR-FaridNeural'],
  'sw-KE': ['sw-KE-ZuriNeural', 'sw-KE-RafikiNeural'],
  'af-ZA': ['af-ZA-AdriNeural', 'af-ZA-WillemNeural'],
};

// Human-readable labels for the language dropdown, in the same order as they
// should appear (English variants first, then grouped roughly by region).
const LANGUAGE_LABELS = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'],
  ['en-IN', 'English (India)'], ['en-CA', 'English (Canada)'],
  ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'],
  ['fr-FR', 'French (France)'], ['fr-CA', 'French (Canada)'],
  ['de-DE', 'German'], ['it-IT', 'Italian'],
  ['pt-BR', 'Portuguese (Brazil)'], ['pt-PT', 'Portuguese (Portugal)'],
  ['nl-NL', 'Dutch'], ['ru-RU', 'Russian'], ['pl-PL', 'Polish'],
  ['sv-SE', 'Swedish'], ['nb-NO', 'Norwegian'], ['da-DK', 'Danish'], ['fi-FI', 'Finnish'],
  ['el-GR', 'Greek'], ['tr-TR', 'Turkish'], ['cs-CZ', 'Czech'], ['hu-HU', 'Hungarian'],
  ['ro-RO', 'Romanian'], ['uk-UA', 'Ukrainian'],
  ['ar-SA', 'Arabic (Saudi Arabia)'], ['ar-EG', 'Arabic (Egypt)'], ['he-IL', 'Hebrew'],
  ['hi-IN', 'Hindi'], ['bn-IN', 'Bengali'], ['ta-IN', 'Tamil'], ['ur-PK', 'Urdu'], ['fa-IR', 'Persian'],
  ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'], ['zh-HK', 'Chinese (Hong Kong)'],
  ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['vi-VN', 'Vietnamese'], ['th-TH', 'Thai'],
  ['id-ID', 'Indonesian'], ['ms-MY', 'Malay'], ['fil-PH', 'Filipino'],
  ['sw-KE', 'Swahili'], ['af-ZA', 'Afrikaans'],
];

const DEFAULT_FORM_JSON = `{
  "system_prompt": "You are a customer support agent. Collect the user's name and contact number.",
  "required_fields": [
    { "key": "name",  "label": "Full Name",     "description": "The user's full name" },
    { "key": "phone", "label": "Phone Number",  "description": "The user's contact number" }
  ]
}`;

// ── Small helpers ─────────────────────────────────────────────────────────────

function parseFormJson(str) {
  try {
    const cfg = JSON.parse(str);
    return { ok: true, cfg };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Transcript reducer ────────────────────────────────────────────────────────
// segments: Map<id, { id, text, final, isAgent }>
// stored as an array for rendering; keyed by id for updates

function transcriptReducer(state, action) {
  switch (action.type) {
    case 'UPSERT': {
      const { id, text, final: isFinal, isAgent } = action;
      const idx = state.findIndex(s => s.id === id);
      if (idx === -1) return [...state, { id, text, final: isFinal, isAgent }];
      const next = [...state];
      next[idx] = { ...next[idx], text, final: isFinal };
      return next;
    }
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

// ── Inline style helpers ──────────────────────────────────────────────────────

const S = {
  select: {
    width: '100%',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-light)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    outline: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-light)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '90px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '5px',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    marginBottom: '12px',
  },
};

// ── Main component ────────────────────────────────────────────────────────────

export const VoiceAgentApp = () => {
  const { token, authFetch } = useAuth();

  // ── Agent list ──────────────────────────────────────────────────────────────
  const [agents, setAgents] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  // ── Session state ──────────────────────────────────────────────────────────
  const [sessionState, setSessionState] = useState('idle'); // idle | connecting | connected
  const [muted, setMuted] = useState(false);
  const [hangupConfirming, setHangupConfirming] = useState(false);

  // ── Config (persisted to localStorage so settings survive a page reload) ────
  const [language, setLanguage] = usePersistedState('voice.language', 'en-US');
  const [voice, setVoice] = usePersistedState('voice.voice', 'en-US-JennyNeural');
  const [proactive, setProactive] = usePersistedState('voice.proactive', true);
  const [micDevices, setMicDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [configMode, setConfigMode] = usePersistedState('voice.configMode', 'cdb'); // simple | form | cdb
  const [instructions, setInstructions] = usePersistedState(
    'voice.instructions',
    'You are a helpful, concise voice assistant. Keep responses short and conversational — two or three sentences max.',
  );
  const [formJson, setFormJson] = usePersistedState('voice.formJson', DEFAULT_FORM_JSON);
  const [formJsonError, setFormJsonError] = useState('');
  const [parsedFormConfig, setParsedFormConfig] = useState(null);
  const [collectedFields, setCollectedFields] = useState({});

  // ── CDB mode ───────────────────────────────────────────────────────────────
  const [cdbCustomer, setCdbCustomer] = useState(null); // { status: 'not_found'|'multiple'|'match', ... }
  const [cdbWorkOrder, setCdbWorkOrder] = useState(null);
  const [callerPhone, setCallerPhone] = useState('');

  // ── Settings drawer ────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Transcript ─────────────────────────────────────────────────────────────
  const [segments, dispatchTranscript] = useReducer(transcriptReducer, []);
  const transcriptEndRef = useRef(null);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const [benchTurns, setBenchTurns] = useState([]);

  // ── Mic label + animated dots ──────────────────────────────────────────────
  const [micLabel, setMicLabelRaw] = useState('Not connected');
  const micLabelTimerRef = useRef(null);

  const setMicLabel = useCallback((text, animate = false) => {
    if (micLabelTimerRef.current) {
      clearInterval(micLabelTimerRef.current);
      micLabelTimerRef.current = null;
    }
    if (animate) {
      let n = 0;
      setMicLabelRaw(text + '.');
      micLabelTimerRef.current = setInterval(() => {
        n++;
        setMicLabelRaw(text + '.'.repeat((n % 3) + 1));
      }, 500);
    } else {
      setMicLabelRaw(text);
    }
  }, []);

  // ── Error banner ───────────────────────────────────────────────────────────
  const [error, setError] = useState('');
  const errorTimerRef = useRef(null);

  const showError = useCallback((msg) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(''), 8000);
  }, []);

  // ── Refs for imperative objects ───────────────────────────────────────────
  const roomRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);
  const sseRef = useRef(null);
  const sseTimerRef = useRef(null);
  const hangupConfirmTimerRef = useRef(null);
  const joinTimeoutRef = useRef(null);
  const sessionGenRef = useRef(0);
  const connectingRef = useRef(false);
  const isSwitchingRef = useRef(false);
  const canvasRef = useRef(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 });

  // ── Visualizer ────────────────────────────────────────────────────────────
  const stopVisualizer = useCallback(() => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startVisualizer = useCallback((stream) => {
    stopVisualizer();
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
    }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const draw = () => {
        animationIdRef.current = requestAnimationFrame(draw);
        const { w, h } = canvasSizeRef.current;
        if (!w || !h) return;
        const gCtx = canvas.getContext('2d');
        const bufLen = analyserRef.current.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        analyserRef.current.getByteFrequencyData(data);
        gCtx.clearRect(0, 0, w, h);
        const barW = w / bufLen;
        const barColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-primary').trim() || '#09090b';
        gCtx.fillStyle = barColor;
        for (let i = 0; i < bufLen; i++) {
          const barH = (data[i] / 255) * h * 0.8;
          gCtx.fillRect(i * barW, (h - barH) / 2, Math.max(1, barW - 2), barH);
        }
      };
      draw();
    } catch (e) {
      console.error('Visualizer error:', e);
    }
  }, [stopVisualizer]);

  // Resize canvas on container resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      canvasSizeRef.current = { w: canvas.offsetWidth, h: canvas.offsetHeight };
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Bench metrics ─────────────────────────────────────────────────────────
  const loadBench = useCallback(async (agentId) => {
    if (!agentId) return;
    try {
      const res = await authFetch(`/voice-api/bench/${agentId}`);
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
      await authFetch(`/voice-api/bench/clear/${selectedId}`, { method: 'POST' });
      setBenchTurns([]);
    } catch (e) {
      console.error('Clear metrics error:', e);
    }
  }, [authFetch, selectedId]);

  // ── SSE stream ────────────────────────────────────────────────────────────
  const initStream = useCallback((tok) => {
    if (sseRef.current) sseRef.current.close();
    if (sseTimerRef.current) { clearTimeout(sseTimerRef.current); sseTimerRef.current = null; }

    const es = new EventSource(`/voice-api/stream?token=${encodeURIComponent(tok)}`);
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

      // [field] key: value — form mode
      const m = typeof line === 'string' && line.match(/^\[field\] ([^:]+): (.+)$/);
      if (m) {
        setCollectedFields(prev => ({ ...prev, [m[1].trim()]: m[2].trim() }));
      }

      // [customer] {...} / [workorder] {...} — CDB mode
      const cm = typeof line === 'string' && line.match(/^\[customer\] (.+)$/);
      if (cm) {
        try { setCdbCustomer(JSON.parse(cm[1])); } catch {}
      }
      const wm = typeof line === 'string' && line.match(/^\[workorder\] (.+)$/);
      if (wm) {
        try { setCdbWorkOrder(JSON.parse(wm[1])); } catch {}
      }

      // Turn reload trigger
      if (typeof line === 'string' && line.includes('Turn #')) {
        // use timeout ref to access selectedId from closure
        setTimeout(() => {
          const id = selectedIdRef.current;
          if (id) loadBench(id);
        }, 500);
      }
    };

    es.onerror = () => {
      sseTimerRef.current = setTimeout(() => initStream(tok), 5000);
    };
  }, [loadBench, setMicLabel, stopVisualizer]);

  // Ref to always have latest selectedId inside SSE callback
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // (Re)connect SSE when token changes
  useEffect(() => {
    if (!token) return;
    initStream(token);
    return () => {
      if (sseRef.current) sseRef.current.close();
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
    };
  }, [token, initStream]);

  // ── Load agents on mount ──────────────────────────────────────────────────
  useEffect(() => {
    authFetch('/voice-api/agents')
      .then(r => r.json())
      .then(data => {
        setAgents(data);
        const firstId = Object.keys(data)[0];
        if (firstId) {
          setSelectedId(firstId);
          loadBench(firstId);
        }
        // Check if session is already running
        return authFetch('/voice-api/agent/status').then(r2 => r2.json()).then(status => {
          if (status.running && status.agent && !roomRef.current && !connectingRef.current) {
            setSelectedId(status.agent);
          }
        });
      })
      .catch(e => console.error('Agent load error:', e));
  }, [authFetch, loadBench]);

  // ── Mic devices ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        setMicDevices(mics);
        if (mics.length) setSelectedMic(mics[0].deviceId);
      } catch {
        setMicDevices([{ deviceId: 'default', label: 'Default Microphone' }]);
        setSelectedMic('default');
      }
    }
    init();
  }, []);

  // Sync voice options when language changes
  useEffect(() => {
    const voices = VOICE_BY_LANG[language] || VOICE_BY_LANG['en-US'];
    if (!voices.includes(voice)) setVoice(voices[0]);
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Form JSON parse
  useEffect(() => {
    const { ok, cfg, error: err } = parseFormJson(formJson);
    if (ok) {
      setParsedFormConfig(cfg);
      setFormJsonError('');
    } else {
      setFormJsonError('Invalid JSON: ' + err);
      setParsedFormConfig(null);
    }
  }, [formJson]);

  // Form mode and CDB mode now run on all three agents (Pipeline, Voice Live,
  // GPT Realtime) — each has its own function-calling implementation, so there's
  // no longer any agent-based restriction on which config mode can be selected.
  const handleConfigModeSwitch = (mode) => {
    setConfigMode(mode);
  };

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  // ── Session management ────────────────────────────────────────────────────

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
  }, [setMicLabel, stopVisualizer]);

  const joinRoom = useCallback(async (myGen) => {
    if (roomRef.current) return;
    try {
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const tokenRes = await authFetch('/voice-api/token');
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
          dispatchTranscript({ type: 'UPSERT', id: seg.id, text, final: seg.final, isAgent });
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

      // Safety net: if no agent ever joins (dispatch failure, dead worker, etc.),
      // don't leave the user stuck on "waiting" forever — bail out and let them retry.
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
  }, [authFetch, selectedMic, agents, startVisualizer, resetSessionUI, setMicLabel, showError]);

  const startSession = useCallback(async () => {
    if (roomRef.current || connectingRef.current) return;
    if (!selectedId) return;

    connectingRef.current = true;
    setSessionState('connecting');
    dispatchTranscript({ type: 'CLEAR' });
    setCollectedFields({});
    setCdbCustomer(null);
    setCdbWorkOrder(null);
    const myGen = ++sessionGenRef.current;
    setMicLabel(`Starting ${agents[selectedId]?.label || selectedId}`, true);

    try {
      const payload = {
        voice,
        language,
        proactive,
      };
      if (configMode === 'simple') {
        payload.instructions = instructions;
      } else if (configMode === 'form') {
        payload.agent_config = parsedFormConfig;
      } else if (configMode === 'cdb') {
        payload.cdb_mode = true;
        if (callerPhone.trim()) payload.caller_phone = callerPhone.trim();
      }

      const startRes = await authFetch(`/voice-api/agent/start/${selectedId}`, {
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
  }, [
    selectedId, agents, voice, language, proactive, configMode, instructions,
    parsedFormConfig, callerPhone, authFetch, joinRoom, resetSessionUI, setMicLabel, showError,
  ]);

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
    try { await authFetch('/voice-api/agent/stop', { method: 'POST' }); } catch (e) {
      console.error('Stop agent error:', e);
    }
    resetSessionUI();
  }, [hangupConfirming, authFetch, resetSessionUI]);

  const toggleMute = useCallback(async () => {
    if (!roomRef.current) return;
    try {
      const next = !muted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
      setMicLabel(next ? 'Microphone muted' : 'Mic active — speak now');
    } catch (e) {
      console.error('Mute error:', e);
    }
  }, [muted, setMicLabel]);

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
      try { await authFetch('/voice-api/agent/stop', { method: 'POST' }); } catch {}
      isSwitchingRef.current = false;
    }
  }, [selectedId, agents, loadBench, setMicLabel, authFetch]);

  // Switch agent mid-session: once selectedId updates and we were connected, restart
  const prevSelectedRef = useRef(selectedId);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedId;
    if (prev !== selectedId && selectedId && sessionState !== 'idle') {
      startSession();
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch mic device live
  const handleMicChange = useCallback(async (deviceId) => {
    setSelectedMic(deviceId);
    if (!roomRef.current) return;
    try {
      const pub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (pub?.track) await roomRef.current.localParticipant.unpublishTrack(pub.track);
      await roomRef.current.localParticipant.setMicrophoneEnabled(true, { deviceId });
      const localTrack = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (localTrack) startVisualizer(new MediaStream([localTrack.mediaStreamTrack]));
    } catch (e) {
      console.error('Mic switch error:', e);
    }
  }, [startVisualizer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (micLabelTimerRef.current) clearInterval(micLabelTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (hangupConfirmTimerRef.current) clearTimeout(hangupConfirmTimerRef.current);
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      if (sseRef.current) sseRef.current.close();
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
      stopVisualizer();
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} }
      if (roomRef.current) { try { roomRef.current.disconnect(); } catch {} }
    };
  }, [stopVisualizer]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isActive = sessionState !== 'idle';
  const isConnecting = sessionState === 'connecting';
  // "Handshaking" covers every pre-audio phase (starting the agent process,
  // joining the room, waiting for the agent to actually connect) — there's
  // nothing to visualize yet, so show a pulsing indicator instead of a blank canvas.
  const isHandshaking = isConnecting || (sessionState === 'connected' && micLabel.startsWith('Waiting for'));
  const voiceOptions = VOICE_BY_LANG[language] || VOICE_BY_LANG['en-US'];
  const parsedFields = parsedFormConfig?.required_fields || [];

  // ── Render ────────────────────────────────────────────────────────────────
  const currentAgent = selectedId ? agents[selectedId] : null;
  const modeLabel = configMode === 'simple' ? 'Simple' : configMode === 'form' ? 'Form Mode' : 'Customer DB';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="page-main voice-page-main" style={{ padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Error banner */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red-glow)',
            borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
            fontSize: '13px', color: 'var(--red-glow)', flexShrink: 0,
          }}>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              style={{ background: 'none', border: 'none', color: 'var(--red-glow)', cursor: 'pointer', fontSize: '14px', padding: 0, opacity: 0.7 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: currentAgent?.color || 'var(--violet-glow)', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentAgent?.label || 'No agent selected'}
            </span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>· {modeLabel}</span>
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

        {/* Voice layout — single column; everything here reflects the live call */}
        <div className="voice-layout" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0, overflowY: 'auto' }}>

          {/* Dialer — CDB mode only. Simulates caller ID: typed digits match the DB
              exactly, sidestepping unreliable STT transcription of spoken phone numbers. */}
          {configMode === 'cdb' && (
            <div className="erp-card" style={{ flexShrink: 0, padding: '14px 16px' }}>
              <h3 className="erp-card-title" style={{ marginBottom: '8px' }}>
                <i className="fa-solid fa-phone"></i> Caller ID
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Dial the number this call is coming from — the agent matches it instantly instead of asking the caller to say it out loud.
              </div>
              <input
                type="tel"
                value={callerPhone}
                onChange={e => setCallerPhone(e.target.value)}
                disabled={isActive}
                placeholder="e.g. +358 40 123 4567"
                style={{ ...S.select, cursor: 'text', opacity: isActive ? 0.5 : 1, fontFamily: 'JetBrains Mono, monospace', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Visualizer card */}
          <div className="erp-card" style={{ height: '120px', flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 16px' }}>
            {isHandshaking ? (
              <div style={{ height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: '9px', height: '9px', borderRadius: '50%', background: 'var(--violet-glow)',
                      animation: `voice-handshake-pulse 1.1s ${(i * 0.15).toFixed(2)}s ease-in-out infinite`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                aria-label="Audio visualizer"
                style={{ width: '100%', height: '70px', display: 'block' }}
              />
            )}
            <div style={{ position: 'absolute', bottom: '8px', left: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {micLabel}
            </div>
            <style>{`
              @keyframes voice-handshake-pulse {
                0%, 100% { transform: scale(0.7); opacity: 0.4; }
                50%      { transform: scale(1.15); opacity: 1; }
              }
            `}</style>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
            {!isActive && (() => {
              const needsPhone = configMode === 'cdb' && !callerPhone.trim();
              const startDisabled = !selectedId || isConnecting || needsPhone;
              return (
                <button
                  type="button"
                  onClick={startSession}
                  disabled={startDisabled}
                  title={needsPhone ? 'Dial a Caller ID number first' : ''}
                  style={{
                    flex: '1 1 200px', padding: '11px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    cursor: startDisabled ? 'not-allowed' : 'pointer',
                    background: 'var(--violet-glow)',
                    color: '#fff',
                    border: 'none',
                    opacity: startDisabled ? 0.5 : 1,
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {isConnecting
                    ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Connecting…</>
                    : <><i className="fa-solid fa-phone"></i> {needsPhone ? 'Dial a number first' : 'Start Session'}</>
                  }
                </button>
              );
            })()}
            {isActive && (
              <>
                <button
                  type="button"
                  onClick={hangupSession}
                  style={{
                    flex: '1 1 200px', padding: '11px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer',
                    background: hangupConfirming
                      ? 'var(--red-glow)'
                      : 'rgba(239,68,68,0.15)',
                    color: hangupConfirming ? '#fff' : 'var(--red-glow)',
                    border: `1px solid ${hangupConfirming ? 'var(--red-glow)' : 'rgba(239,68,68,0.4)'}`,
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    transition: 'all 0.15s',
                    animation: hangupConfirming ? 'pulse-red 1s infinite' : 'none',
                  }}
                >
                  <i className={`fa-solid ${hangupConfirming ? 'fa-triangle-exclamation' : 'fa-phone-slash'}`}></i>
                  {hangupConfirming ? 'Confirm end?' : 'End Call'}
                </button>
                {sessionState === 'connected' && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    style={{
                      padding: '11px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                      cursor: 'pointer',
                      background: muted ? 'rgba(239,68,68,0.1)' : 'var(--bg-card)',
                      color: muted ? 'var(--red-glow)' : 'var(--text-primary)',
                      border: `1px solid ${muted ? 'rgba(239,68,68,0.4)' : 'var(--border-light)'}`,
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <i className={`fa-solid ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Live status: what's being pulled from the caller right now */}
          {configMode === 'form' && parsedFields.length > 0 && (
            <div className="erp-card" style={{ flexShrink: 0 }}>
              <h3 className="erp-card-title">
                <i className="fa-solid fa-list-check"></i> Collected Fields Progress
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {parsedFields.map(f => {
                  const collected = collectedFields[f.key] !== undefined;
                  return (
                    <div
                      key={f.key}
                      style={{
                        flex: '1 1 200px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 10px', borderRadius: '7px', fontSize: '11.5px',
                        border: `1px solid ${collected ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}`,
                        background: collected ? 'rgba(16,185,129,0.05)' : 'var(--bg-muted)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: collected ? 'var(--green-glow)' : 'var(--text-muted)', fontSize: '13px', flexShrink: 0 }}>
                          {collected ? '✓' : '○'}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '11.5px' }}>{f.label || f.key}</div>
                          {f.description && (
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{f.description}</div>
                          )}
                        </div>
                      </div>
                      {collected
                        ? <span style={{ fontWeight: 700, color: 'var(--green-glow)', fontSize: '11px', flexShrink: 0, marginLeft: '8px' }}>{collectedFields[f.key]}</span>
                        : <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0, marginLeft: '8px' }}>Pending</span>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {configMode === 'cdb' && (
            <div className="voice-cdb-status-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
              {/* Customer Lookup */}
              <div className="erp-card" style={{ flex: '1 1 240px', minWidth: 0 }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-user-magnifying-glass"></i> Customer Lookup
                </h3>
                {!cdbCustomer && (
                  <div style={{ padding: '10px', borderRadius: '7px', border: '1px solid var(--border-light)', background: 'var(--bg-muted)', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Waiting for the caller to give a name…
                  </div>
                )}
                {cdbCustomer?.status === 'match' && (
                  <div style={{ padding: '10px', borderRadius: '7px', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--green-glow)', fontSize: '13px' }}>✓</span>
                      <span style={{ fontWeight: 600, fontSize: '12px' }}>{cdbCustomer.customer?.full_name}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cdbCustomer.customer?.phone_number}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {cdbCustomer.customer?.property_address}
                      {cdbCustomer.customer?.apartment_number ? `, Apt ${cdbCustomer.customer.apartment_number}` : ''}
                    </div>
                    {cdbCustomer.customer?.language_preference && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <i className="fa-solid fa-language" style={{ marginRight: '5px' }}></i>
                        Prefers {cdbCustomer.customer.language_preference}
                      </div>
                    )}
                    {cdbCustomer.customer?.notes && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                        <i className="fa-solid fa-note-sticky" style={{ marginRight: '5px' }}></i>
                        {cdbCustomer.customer.notes}
                      </div>
                    )}
                  </div>
                )}
                {cdbCustomer?.status === 'multiple' && (
                  <div style={{ padding: '10px', borderRadius: '7px', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>Multiple matches — narrowing down</div>
                    {(cdbCustomer.matches || []).map(m => (
                      <div key={m.id} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {m.full_name} — {m.property_address}
                      </div>
                    ))}
                  </div>
                )}
                {cdbCustomer?.status === 'not_found' && (
                  <div style={{ padding: '10px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', fontSize: '11.5px', color: 'var(--red-glow)' }}>
                    No record found for "{cdbCustomer.query}" — collecting details manually.
                  </div>
                )}
              </div>

              {/* Details Collected */}
              <div className="erp-card" style={{ flex: '1 1 240px', minWidth: 0 }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-clipboard-list"></i> Details Collected
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { key: 'issue', label: 'Issue' },
                    { key: 'common_area', label: 'Common area?' },
                    { key: 'master_key', label: 'Master key OK?' },
                    { key: 'access_notes', label: 'Access notes' },
                  ].map(f => {
                    const collected = collectedFields[f.key] !== undefined;
                    return (
                      <div
                        key={f.key}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '7px 10px', borderRadius: '7px', fontSize: '11px',
                          border: `1px solid ${collected ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}`,
                          background: collected ? 'rgba(16,185,129,0.05)' : 'var(--bg-muted)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: collected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 700, color: collected ? 'var(--green-glow)' : 'var(--text-muted)' }}>
                            {collected ? '✓' : '○'}
                          </span>
                          {f.label}
                        </span>
                        {collected
                          ? <span style={{ fontWeight: 600, color: 'var(--green-glow)', maxWidth: '130px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{collectedFields[f.key]}</span>
                          : <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pending</span>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Work Order */}
              <div className="erp-card" style={{ flex: '1 1 240px', minWidth: 0 }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-receipt"></i> Work Order
                </h3>
                {!cdbWorkOrder && (
                  <div style={{ padding: '10px', borderRadius: '7px', border: '1px solid var(--border-light)', background: 'var(--bg-muted)', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Not created yet
                  </div>
                )}
                {cdbWorkOrder && (
                  <div style={{ padding: '10px', borderRadius: '7px', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--green-glow)', marginBottom: '4px' }}>{cdbWorkOrder.id}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cdbWorkOrder.issue_description}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Scheduled: {cdbWorkOrder.scheduled_time}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Technician: {cdbWorkOrder.technician}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transcript */}
          <div className="erp-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '260px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="erp-card-title" style={{ marginBottom: 0 }}>
                <i className="fa-solid fa-comments"></i> Live Transcript
              </h3>
              {segments.length > 0 && (
                <button
                  type="button"
                  onClick={() => dispatchTranscript({ type: 'CLEAR' })}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {segments.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: '10px' }}>
                  <i className="fa-regular fa-comments" style={{ fontSize: '24px', opacity: 0.4 }}></i>
                  <p style={{ fontSize: '12px' }}>Transcript will appear here once connected.</p>
                </div>
              ) : (
                segments.map(seg => (
                  <div
                    key={seg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: seg.isAgent ? 'flex-start' : 'flex-end',
                    }}
                  >
                    <span style={{
                      fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
                      color: seg.isAgent ? 'var(--violet-glow)' : 'var(--cyan-glow)',
                      marginBottom: '3px', paddingLeft: seg.isAgent ? 0 : undefined, paddingRight: seg.isAgent ? undefined : 0,
                    }}>
                      {seg.isAgent ? 'Agent' : 'You'}
                    </span>
                    <div style={{
                      maxWidth: '80%', padding: '9px 13px', borderRadius: seg.isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                      fontSize: '13px', lineHeight: 1.45,
                      background: seg.isAgent ? 'rgba(139,92,246,0.08)' : 'rgba(6,182,212,0.08)',
                      border: `1px solid ${seg.isAgent ? 'rgba(139,92,246,0.15)' : 'rgba(6,182,212,0.15)'}`,
                      color: 'var(--text-primary)',
                      opacity: seg.final ? 1 : 0.7,
                      transition: 'opacity 0.2s',
                      wordBreak: 'break-word',
                    }}>
                      {seg.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
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

              {/* Agent Selection */}
              <div className="erp-card" style={{ marginBottom: '16px' }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-robot"></i> Select Agent
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.keys(agents).length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>
                      Loading agents…
                    </div>
                  )}
                  {Object.entries(agents).map(([id, agent]) => {
                    const isSelected = id === selectedId;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleAgentSelect(id)}
                        style={{
                          textAlign: 'left', padding: '12px', borderRadius: '10px', cursor: 'pointer',
                          border: isSelected ? `1px solid ${agent.color || 'var(--violet-glow)'}` : '1px solid var(--border-light)',
                          background: isSelected ? 'var(--bg-muted)' : 'var(--bg-card)',
                          boxShadow: isSelected ? `0 0 0 2px ${agent.color || 'var(--violet-glow)'}22` : 'none',
                          transition: 'all 0.15s',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: agent.color || 'var(--violet-glow)', display: 'inline-block', flexShrink: 0 }} />
                            {agent.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>{agent.subtitle}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-muted)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                            {agent.model}
                          </span>
                          <span style={{ fontSize: '11.5px', fontWeight: 500, color: agent.color || 'var(--violet-glow)' }}>
                            {agent.e2e_target} ms
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Call Settings */}
              <div className="erp-card" style={{ marginBottom: '16px' }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-sliders"></i> Call Settings
                </h3>

                <div style={S.controlGroup}>
                  <label style={S.label}>Language</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    disabled={isActive}
                    style={{ ...S.select, opacity: isActive ? 0.5 : 1 }}
                  >
                    {LANGUAGE_LABELS.map(([code, label]) => (
                      <option key={code} value={code}>{label} ({code})</option>
                    ))}
                  </select>
                </div>

                <div style={S.controlGroup}>
                  <label style={S.label}>Neural Voice</label>
                  <select
                    value={voice}
                    onChange={e => setVoice(e.target.value)}
                    disabled={isActive}
                    style={{ ...S.select, opacity: isActive ? 0.5 : 1 }}
                  >
                    {voiceOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div style={S.controlGroup}>
                  <label style={S.label}>Microphone</label>
                  <select
                    value={selectedMic}
                    onChange={e => handleMicChange(e.target.value)}
                    style={S.select}
                  >
                    {micDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Default Microphone'}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 500, cursor: isActive ? 'not-allowed' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={proactive}
                      onChange={e => setProactive(e.target.checked)}
                      disabled={isActive}
                      style={{ width: '14px', height: '14px', accentColor: 'var(--violet-glow)', cursor: isActive ? 'not-allowed' : 'pointer' }}
                    />
                    Proactive mode (agent speaks first)
                  </label>
                </div>
              </div>

              {/* Agent Config */}
              <div className="erp-card" style={{ marginBottom: '16px' }}>
                <h3 className="erp-card-title">
                  <i className="fa-solid fa-gear"></i> Agent Config
                </h3>

                {/* Tab switcher — Form and Customer DB now work on every agent */}
                <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '8px', padding: '3px', marginBottom: '12px', border: '1px solid var(--border-light)' }}>
                  {['simple', 'form', 'cdb'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleConfigModeSwitch(mode)}
                      style={{
                        flex: 1, padding: '6px', borderRadius: '6px', fontSize: '12px',
                        cursor: 'pointer',
                        border: 'none',
                        background: configMode === mode ? 'var(--bg-card)' : 'transparent',
                        color: configMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontWeight: configMode === mode ? 600 : 400,
                        transition: 'all 0.15s',
                        fontFamily: 'inherit',
                        textTransform: 'capitalize',
                      }}
                    >
                      {mode === 'simple' ? 'Simple' : mode === 'form' ? 'Form Mode' : 'Customer DB'}
                    </button>
                  ))}
                </div>

                {configMode === 'simple' && (
                  <div>
                    <label style={S.label}>System Instructions</label>
                    <textarea
                      value={instructions}
                      onChange={e => setInstructions(e.target.value)}
                      disabled={isActive}
                      placeholder="Enter custom instructions for the agent…"
                      style={{ ...S.textarea, opacity: isActive ? 0.5 : 1 }}
                    />
                  </div>
                )}

                {configMode === 'form' && (
                  <div>
                    <label style={S.label}>JSON Schema (Fields to Collect)</label>
                    <textarea
                      value={formJson}
                      onChange={e => setFormJson(e.target.value)}
                      disabled={isActive}
                      placeholder="Enter JSON config schema…"
                      style={{ ...S.textarea, opacity: isActive ? 0.5 : 1, fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}
                    />
                    {formJsonError && (
                      <div style={{ fontSize: '11px', color: 'var(--red-glow)', marginTop: '4px', wordBreak: 'break-word' }}>
                        {formJsonError}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                      Live progress on each field is shown on the main call screen once the session starts.
                    </div>
                  </div>
                )}

                {configMode === 'cdb' && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Dial a number in the Caller ID box on the main screen to match the caller instantly —
                    or leave it blank and the agent will ask for their name and search by voice
                    instead. Either way, it confirms identity, collects the issue, and files a
                    work order automatically. Live progress is shown on the main call screen once the session starts.
                  </div>
                )}
              </div>

              {/* Latency Metrics */}
              <div className="erp-card" style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 className="erp-card-title" style={{ marginBottom: 0 }}>
                    <i className="fa-solid fa-gauge-high"></i> Latency Metrics
                  </h3>
                  <button
                    type="button"
                    onClick={clearMetrics}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                  >
                    Clear
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Turn', 'End-to-End', 'STT', 'Duration'].map(h => (
                        <th key={h} style={{ color: 'var(--text-muted)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: '11px' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {benchTurns.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 8px', fontSize: '12px' }}>
                          No data yet.
                        </td>
                      </tr>
                    ) : (
                      benchTurns.map(t => {
                        const e2e = t.e2e_ms ? Math.round(t.e2e_ms) : null;
                        const stt = t.stt_ms ? Math.round(t.stt_ms) : null;
                        const dur = (t.response_done_ms && t.speech_stopped_ms)
                          ? Math.round(t.response_done_ms - t.speech_stopped_ms) : null;
                        const barW = e2e ? Math.min(100, Math.round((e2e / 5500) * 100)) : 0;
                        const agentColor = (selectedId && agents[selectedId]?.color) || 'var(--violet-glow)';
                        return (
                          <tr key={t.turn}>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-primary)' }}>{t.turn}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ background: 'var(--bg-muted)', height: '5px', borderRadius: '3px', flex: 1, maxWidth: '100px', overflow: 'hidden' }}>
                                  <div style={{ width: `${barW}%`, height: '100%', borderRadius: '3px', background: agentColor, minWidth: '4px', transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{e2e !== null ? `${e2e} ms` : '—'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{stt !== null ? `${stt} ms` : '—'}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-muted)', color: 'var(--text-secondary)' }}>{dur !== null ? `${dur} ms` : '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* pulse-red keyframe via inline style tag */}
        <style>{`
          @keyframes pulse-red {
            0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
            70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
            100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          }
        `}</style>
      </div>
    </div>
  );
};
