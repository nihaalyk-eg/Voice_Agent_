import React from 'react';

export function FormPanel({ parsedFields, collectedFields }) {
  if (!parsedFields || parsedFields.length === 0) return null;

  return (
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
  );
}
