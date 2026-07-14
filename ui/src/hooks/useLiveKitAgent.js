import { useState, useRef, useCallback, useEffect } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

export function useLiveKitAgent(authFetch, token) {
  const [agents, setAgents] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  const [sessionState, setSessionState] = useState('idle'); // idle | connecting | connected
  const [muted, setMuted] = useState(false);
  
  const [micDevices, setMicDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  
  const [micLabelRaw, setMicLabelRaw] = useState('Not connected');
  const micLabelTimerRef = useRef(null);

  const [error, setError] = useState('');
  const errorTimerRef = useRef(null);
  
  const roomRef = useRef(null);
  const connectingRef = useRef(false);
  const sessionGenRef = useRef(0);
  const joinTimeoutRef = useRef(null);
  
  // Audio Visualizer refs
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 });

  const showError = useCallback((msg) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(''), 8000);
  }, []);

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
        const barColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#09090b';
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

  // Load Mic Devices
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (micLabelTimerRef.current) clearInterval(micLabelTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      stopVisualizer();
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} }
      if (roomRef.current) { try { roomRef.current.disconnect(); } catch {} }
    };
  }, [stopVisualizer]);

  return {
    agents, setAgents,
    selectedId, setSelectedId,
    sessionState, setSessionState,
    muted, setMuted,
    micDevices, selectedMic, handleMicChange,
    micLabel: micLabelRaw, setMicLabel,
    error, setError, showError,
    roomRef, connectingRef, sessionGenRef, joinTimeoutRef,
    canvasRef, canvasSizeRef,
    startVisualizer, stopVisualizer,
    toggleMute
  };
}
