// ==========================================================================
// Observability & Cost Analytics dashboard scripting
// ==========================================================================
let updateInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  await loadStats();
  
  // Refresh stats every 5 seconds
  updateInterval = setInterval(loadStats, 5000);
});

async function loadStats() {
  try {
    const res = await authFetch('/api/observability/stats');
    const data = await res.json();
    if (data.success) {
      hydrateKPIs(data);
      hydrateThroughput(data);
    }
  } catch (err) {
    console.error('Failed to load observability stats:', err);
  }
}

function hydrateKPIs(data) {
  // Cumulative Cost
  const cumCostEl = document.getElementById('metric-cumulative-cost');
  if (cumCostEl) {
    cumCostEl.textContent = `$${parseFloat(data.cumulative_cost).toFixed(5)}`;
  }

  // Voice Cost
  const voiceCostEl = document.getElementById('metric-voice-cost');
  if (voiceCostEl) {
    voiceCostEl.textContent = `$${parseFloat(data.voice_cost).toFixed(2)}`;
  }

  // Email Cost
  const emailCostEl = document.getElementById('metric-email-cost');
  if (emailCostEl) {
    emailCostEl.textContent = `$${parseFloat(data.email_cost).toFixed(2)}`;
  }

  // Cache Hit Rate
  const cacheHitEl = document.getElementById('metric-cache-hit');
  if (cacheHitEl) {
    cacheHitEl.textContent = `${data.cache_hit_rate}%`;
  }

  // Latency
  const latencyEl = document.getElementById('metric-latency');
  if (latencyEl) {
    latencyEl.textContent = `${data.mean_latency_seconds}s`;
  }

  // Invocations
  const invocationsEl = document.getElementById('metric-invocations');
  if (invocationsEl) {
    const total = parseInt(data.total_calls || 0) + parseInt(data.total_emails || 0);
    invocationsEl.textContent = `${total} case${total !== 1 ? 's' : ''}`;
  }

  // Calls count
  const callCountEl = document.getElementById('metric-call-count');
  if (callCountEl) {
    callCountEl.textContent = data.total_calls;
  }

  // Emails count
  const emailCountEl = document.getElementById('metric-email-count');
  if (emailCountEl) {
    emailCountEl.textContent = data.total_emails;
  }
}

function hydrateThroughput(data) {
  const v = data.throughput?.voice || {};
  const e = data.throughput?.email || {};

  const voiceTextTotal = (v.input_text || 0) + (v.output_text || 0);
  const voiceAudioTotal = (v.input_audio || 0) + (v.output_audio || 0);
  const emailTextTotal = (e.input_text || 0) + (e.output_text || 0);

  // Text values
  const voiceTextEl = document.getElementById('stat-voice-text-tokens');
  if (voiceTextEl) voiceTextEl.textContent = `${voiceTextTotal.toLocaleString()} tkn`;
  
  const voiceAudioEl = document.getElementById('stat-voice-audio-tokens');
  if (voiceAudioEl) voiceAudioEl.textContent = `${voiceAudioTotal.toLocaleString()} tkn`;

  const emailTextEl = document.getElementById('stat-email-text-tokens');
  if (emailTextEl) emailTextEl.textContent = `${emailTextTotal.toLocaleString()} tkn`;

  // Bar elements
  const barVoiceText = document.getElementById('bar-voice-text-tokens');
  const barVoiceAudio = document.getElementById('bar-voice-audio-tokens');
  const barEmailText = document.getElementById('bar-email-text-tokens');

  // Scale these bars relative to a standard cap (e.g. 50k for voice text, 500k for voice audio, 100k for email text)
  const voiceTextPct = Math.min(100, (voiceTextTotal / 50000) * 100);
  const voiceAudioPct = Math.min(100, (voiceAudioTotal / 500000) * 100);
  const emailTextPct = Math.min(100, (emailTextTotal / 100000) * 100);

  if (barVoiceText) barVoiceText.style.width = `${voiceTextPct}%`;
  if (barVoiceAudio) barVoiceAudio.style.width = `${voiceAudioPct}%`;
  if (barEmailText) barEmailText.style.width = `${emailTextPct}%`;
}

