import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';

export const ObservabilityApp = () => {
  const { authFetch } = useAuth();
  
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
    
    // Poll stats every 5 seconds
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await authFetch('/api/observability/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStats(data);
          setError(null);
        } else {
          setError(data.error || 'Failed to retrieve observability telemetry.');
        }
      } else {
        setError(`Telemetry server responded with status: ${res.status}`);
      }
    } catch (e) {
      console.error(e);
      setError(`Network connection failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getVoiceTextTokens = () => {
    if (!stats?.throughput?.voice) return 0;
    const v = stats.throughput.voice;
    return (v.input_text || 0) + (v.output_text || 0);
  };

  const getVoiceAudioTokens = () => {
    if (!stats?.throughput?.voice) return 0;
    const v = stats.throughput.voice;
    return (v.input_audio || 0) + (v.output_audio || 0);
  };

  const getEmailTextTokens = () => {
    if (!stats?.throughput?.email) return 0;
    const e = stats.throughput.email;
    return (e.input_text || 0) + (e.output_text || 0);
  };

  const voiceTextTotal = getVoiceTextTokens();
  const voiceAudioTotal = getVoiceAudioTokens();
  const emailTextTotal = getEmailTextTokens();

  // Progress calculations
  const voiceTextPct = Math.min(100, (voiceTextTotal / 50000) * 100);
  const voiceAudioPct = Math.min(100, (voiceAudioTotal / 500000) * 100);
  const emailTextPct = Math.min(100, (emailTextTotal / 100000) * 100);

  const totalCases = stats ? (parseInt(stats.total_calls || 0) + parseInt(stats.total_emails || 0)) : 0;

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="page-main">
        <div className="app-container" style={{ flexDirection: 'column' }}>

          {error && !stats ? (
            <div className="loading-placeholder" style={{ flex: 1, padding: '24px' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '32px', marginBottom: '12px', color: 'var(--red-glow)' }}></i>
              <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}>Telemetry Loading Failed</p>
              <p style={{ fontSize: '12px', opacity: 0.8, maxWidth: '300px', margin: '0 auto 16px auto', lineHeight: 1.5 }}>{error}</p>
              <button 
                onClick={fetchStats} 
                className="btn btn-call-secondary" 
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 'none' }}
              >
                <i className="fa-solid fa-arrows-rotate"></i> Retry Connection
              </button>
            </div>
          ) : !stats ? (
            <div className="loading-placeholder" style={{ flex: 1, padding: '24px' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--violet-glow)' }}></i>
              <p style={{ marginTop: '12px' }}>Loading analytics telemetry dashboards...</p>
            </div>
          ) : (
            <div className="observability-dashboard-content" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto' }}>
              
              {/* Telemetry row grid */}
              <div className="obs-metrics-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                
                {/* 1. Cumulative LLM Cost */}
                <div className="erp-card metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="metric-label" style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CUMULATIVE EXPENSE</span>
                  <strong className="metric-value" style={{ fontSize: '24px', fontFamily: 'JetBrains Mono', color: 'var(--violet-glow)' }}>
                    ${parseFloat(stats.cumulative_cost).toFixed(5)}
                  </strong>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Aggregate OpenAI billing</span>
                </div>

                {/* 2. Cache Hit Ratio */}
                <div className="erp-card metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="metric-label" style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>VALKEY CACHE HIT RATIO</span>
                  <strong className="metric-value" style={{ fontSize: '24px', fontFamily: 'JetBrains Mono', color: 'var(--cyan-glow)' }}>
                    {parseFloat(stats.cache_hit_rate).toFixed(2)}%
                  </strong>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Pre-fetch resident read performance</span>
                </div>

                {/* 3. Latency mean */}
                <div className="erp-card metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="metric-label" style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>MEAN SYSTEM LATENCY</span>
                  <strong className="metric-value" style={{ fontSize: '24px', fontFamily: 'JetBrains Mono', color: 'var(--green-glow)' }}>
                    {parseFloat(stats.mean_latency_seconds).toFixed(2)}s
                  </strong>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Average full-turn API response delay</span>
                </div>

                {/* 4. Total Cases logs */}
                <div className="erp-card metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="metric-label" style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>TOTAL PARSED INTAKES</span>
                  <strong className="metric-value" style={{ fontSize: '24px', fontFamily: 'JetBrains Mono', color: '#ffea79' }}>
                    {totalCases} case{totalCases !== 1 ? 's' : ''}
                  </strong>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {stats.total_calls} calls · {stats.total_emails} emails
                  </span>
                </div>

              </div>

              {/* Sub grid: Detail billing & charts */}
              <div className="observability-details-grid">
                
                {/* Billing breakdowns */}
                <div className="erp-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 className="erp-card-title"><i className="fa-solid fa-credit-card"></i> Billing Breakdowns</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong style={{ fontSize: '13px' }}><i className="fa-solid fa-phone-volume" style={{ color: 'var(--violet-glow)', marginRight: '6px' }}></i> Voice Channels</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GPT-4o Realtime streams</span>
                      </div>
                      <strong style={{ fontFamily: 'JetBrains Mono', fontSize: '15px' }}>${parseFloat(stats.voice_cost).toFixed(2)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong style={{ fontSize: '13px' }}><i className="fa-solid fa-envelope" style={{ color: 'var(--cyan-glow)', marginRight: '6px' }}></i> Email Parsing Agent</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Azure LLM text extraction</span>
                      </div>
                      <strong style={{ fontFamily: 'JetBrains Mono', fontSize: '15px' }}>${parseFloat(stats.email_cost).toFixed(2)}</strong>
                    </div>
                  </div>

                </div>

                {/* Token volumes chart */}
                <div className="erp-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 className="erp-card-title"><i className="fa-solid fa-chart-simple"></i> System Throughput Token Chart</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    <div className="vis-bar" style={{ margin: '0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                        <span><i className="fa-solid fa-phone-volume" style={{ marginRight: '6px', color: 'var(--violet-glow)' }}></i> Voice Text Tokens</span>
                        <strong style={{ fontFamily: 'JetBrains Mono' }}>{voiceTextTotal.toLocaleString()} tkn</strong>
                      </div>
                      <div className="bar-bg" style={{ height: '6px' }}>
                        <div className="bar-fill" style={{ width: `${voiceTextPct}%`, background: 'var(--violet-glow)' }}></div>
                      </div>
                    </div>

                    <div className="vis-bar" style={{ margin: '0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                        <span><i className="fa-solid fa-waveform-lines" style={{ marginRight: '6px', color: 'var(--cyan-glow)' }}></i> Voice Audio Tokens</span>
                        <strong style={{ fontFamily: 'JetBrains Mono' }}>{voiceAudioTotal.toLocaleString()} tkn</strong>
                      </div>
                      <div className="bar-bg" style={{ height: '6px' }}>
                        <div className="bar-fill" style={{ width: `${voiceAudioPct}%`, background: 'var(--cyan-glow)' }}></div>
                      </div>
                    </div>

                    <div className="vis-bar" style={{ margin: '0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                        <span><i className="fa-solid fa-envelope" style={{ marginRight: '6px', color: 'var(--green-glow)' }}></i> Email Text Tokens</span>
                        <strong style={{ fontFamily: 'JetBrains Mono' }}>{emailTextTotal.toLocaleString()} tkn</strong>
                      </div>
                      <div className="bar-bg" style={{ height: '6px' }}>
                        <div className="bar-fill" style={{ width: `${emailTextPct}%`, background: 'var(--green-glow)' }}></div>
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
