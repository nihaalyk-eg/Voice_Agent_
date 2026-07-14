import React, { useEffect } from 'react';

export function TranscriptPanel({ segments, dispatchTranscript, transcriptEndRef }) {
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments, transcriptEndRef]);

  return (
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
  );
}
