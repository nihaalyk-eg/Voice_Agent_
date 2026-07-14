import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../components/AuthWrapper';
import { Sidebar } from '../../components/Sidebar';

export const CustomersApp = () => {
  const { authFetch } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [searchVal, setSearchVal] = useState('');
  const [loading, setLoading] = useState(true);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async (query = '') => {
    try {
      const url = query 
        ? `/api/customers?search=${encodeURIComponent(query)}` 
        : '/api/customers';
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchVal(val);

    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchCustomers(val.trim());
    }, 300);
  };

  const getInitials = (name) => {
    return name ? name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?';
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="page-main">
        <div className="app-container" style={{ flexDirection: 'column' }}>

          <div className="customers-page-body" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            
            {/* Search filter bar */}
            <div className="customers-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '20px' }}>
              <div className="dialer-display-wrap customers-search-wrap" style={{ margin: 0, flex: '0 0 320px', background: 'var(--bg-card)' }}>
                <i className="fa-solid fa-magnifying-glass dialer-input-icon"></i>
                <input
                  type="text"
                  className="dialer-display-input"
                  style={{ fontSize: '13px' }}
                  placeholder="Search by resident name or phone..."
                  value={searchVal}
                  onChange={handleSearchChange}
                />
              </div>

              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }} id="customer-count">
                {customers.length} resident{customers.length !== 1 ? 's' : ''} matched
              </div>
            </div>

            {/* Resident Directory Grid */}
            <div
              className="customers-grid"
              id="customers-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
                flex: 1
              }}
            >
              {loading ? (
                <div className="customers-empty" style={{ gridColumn: '1 / -1', padding: '60px 0' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <p>Loading resident database directory...</p>
                </div>
              ) : customers.length === 0 ? (
                <div className="customers-empty" style={{ gridColumn: '1 / -1', padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-user-slash" style={{ fontSize: '28px', marginBottom: '12px' }}></i>
                  <p>No resident matches found for this query.</p>
                </div>
              ) : (
                customers.map(c => {
                  const initials = getInitials(c.full_name);
                  return (
                    <div key={c.id} className="customer-card" style={{ animation: 'fade-in 0.3s ease' }}>
                      <div className="customer-card-header">
                        <div className="customer-avatar">{initials}</div>
                        <div>
                          <div className="customer-name">{c.full_name}</div>
                          <div className="customer-phone">{c.phone_number}</div>
                        </div>
                      </div>
                      
                      <div className="customer-details">
                        <div className="customer-detail-row">
                          <i className="fa-solid fa-location-dot"></i>
                          <span>{c.property_address}</span>
                        </div>
                        <div className="customer-detail-row">
                          <i className="fa-solid fa-door-open"></i>
                          <span>Apartment {c.apartment_number}</span>
                        </div>
                        {c.email && (
                          <div className="customer-detail-row">
                            <i className="fa-solid fa-envelope"></i>
                            <span>{c.email}</span>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
                        <span className="customer-lang-badge"><i className="fa-solid fa-globe"></i> {c.language_preference}</span>
                        {c.notes && (
                          <span className="customer-notes" title={c.notes}>
                            <i className="fa-solid fa-note-sticky" style={{ marginRight: '4px', color: 'var(--violet-glow)' }}></i> {c.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
