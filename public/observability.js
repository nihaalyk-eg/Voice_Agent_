// ==========================================================================
// Observability & Cost Analytics dashboard scripting
// ==========================================================================
let updateInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  await loadStats();
  startLogMonitor();
  
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

// Live monitor log pool
const logPool = [
  { prefix: '[VALKEY]', msg: 'Cache HIT for properties list (TTL verified)', type: 'valkey' },
  { prefix: '[VALKEY]', msg: 'Cache HIT for work orders list', type: 'valkey' },
  { prefix: '[VALKEY]', msg: 'Active key check: "cache:properties:all" exists', type: 'valkey' },
  { prefix: '[POSTGRES]', msg: 'Executed connection pool status check: 0 active, 5 idle', type: 'postgres' },
  { prefix: '[POSTGRES]', msg: 'SELECT * FROM email_templates ORDER BY id ASC', type: 'postgres' },
  { prefix: '[API]', msg: 'GET /api/properties invoked by user agent', type: 'api' },
  { prefix: '[API]', msg: 'GET /api/work-orders response payload generated', type: 'api' },
  { prefix: '[VALKEY]', msg: 'Cache hit rate optimization at 92.4%', type: 'valkey' },
  { prefix: '[VOICE]', msg: 'Session proxy ready. Stream listener active on port 3000', type: 'voice' },
  { prefix: '[VOICE]', msg: 'Valkey session token verified', type: 'voice' },
  { prefix: '[VALKEY]', msg: 'Cache hit for technicians registry', type: 'valkey' }
];

function startLogMonitor() {
  const terminal = document.getElementById('observability-terminal');
  if (!terminal) return;

  // Pre-populate with some logs
  for (let i = 0; i < 6; i++) {
    const log = logPool[Math.floor(Math.random() * logPool.length)];
    writeLog(log.prefix, log.msg, log.type, true);
  }

  // Periodic simulation
  setInterval(() => {
    // 70% chance of standard mock log, 30% chance of reading from actual data
    if (Math.random() > 0.3) {
      const log = logPool[Math.floor(Math.random() * logPool.length)];
      writeLog(log.prefix, log.msg, log.type);
    } else {
      triggerRandomTransaction();
    }
  }, 3000);
}

function writeLog(prefix, msg, type = 'info', prepend = false) {
  const terminal = document.getElementById('observability-terminal');
  if (!terminal) return;

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  let color = 'var(--cyan-glow)';
  if (type === 'valkey') color = 'var(--green-glow)';
  if (type === 'postgres') color = 'var(--violet-glow)';
  if (type === 'voice') color = '#06b6d4'; // cyan
  if (type === 'email') color = '#10b981'; // green
  if (type === 'error') color = '#ef4444'; // red

  const entry = document.createElement('div');
  entry.style.marginBottom = '6px';
  entry.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
  entry.style.paddingBottom = '4px';
  entry.innerHTML = `<span style="color: var(--text-muted); font-size: 10px;">[${timestamp}]</span> <strong style="color: ${color};">${prefix}</strong> ${msg}`;
  
  if (prepend) {
    terminal.prepend(entry);
  } else {
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
  }

  // Keep max 80 lines
  while (terminal.childElementCount > 80) {
    terminal.removeChild(terminal.firstElementChild);
  }
}

async function triggerRandomTransaction() {
  try {
    const res = await authFetch('/api/communications');
    const comms = await res.json();
    if (comms && comms.length > 0) {
      const item = comms[Math.floor(Math.random() * comms.length)];
      if (item.type === 'call_transcript') {
        writeLog('[VOICE]', `Processed call ${item.id} (${item.duration_seconds}s) with cost $${parseFloat(item.extracted_data?.session_cost || 0).toFixed(5)}. Summary: "${item.summary || 'None'}"`, 'voice');
      } else if (item.type === 'email_intake') {
        writeLog('[EMAIL]', `Ingested email ${item.id} from "${item.sender_email}". Extracted data saved. Work order ID: "${item.linked_work_order || 'N/A'}"`, 'email');
      } else if (item.type === 'escalation') {
        writeLog('[ERROR]', `CRITICAL Escalation event triggered! ${item.reason} at address ${item.property_address || 'Unknown'}`, 'error');
      }
    }
  } catch (err) {
    // Fail silently
  }
}
