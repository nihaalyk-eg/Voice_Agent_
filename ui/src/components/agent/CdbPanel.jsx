import React from 'react';

export function CdbPanel({ cdbCustomer, cdbWorkOrder, collectedFields, callerPhone, setCallerPhone, isActive }) {
  return (
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
  );
}
