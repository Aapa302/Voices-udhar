import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RotateCcw, User, Phone, ChevronRight, Loader2, Users } from 'lucide-react';
import { getCustomers } from '../api/customers';

export default function CustomersScreen() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const fetchCustomersList = async (isRefresh = false) => {
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) {
      setError('દુકાનદાર આઈડી મળ્યો નથી. / Shopkeeper ID missing.');
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const data = await getCustomers(shopkeeperId);
      // Sort customers by highest totalUdhaar first
      const sorted = [...data].sort((a, b) => (Number(b.totalUdhaar) || 0) - (Number(a.totalUdhaar) || 0));
      setCustomers(sorted);
    } catch (err) {
      console.error('Error loading customers:', err);
      setError(err.message || 'ગ્રાહકોની યાદી લાવવામાં ભૂલ આવી / Failed to fetch customer list');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCustomersList();
  }, []);

  // Filter customers based on search query
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const query = searchQuery.trim().toLowerCase();
    return customers.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.phone && c.phone.includes(query))
    );
  }, [customers, searchQuery]);

  return (
    <div className="main-content">
      {/* Search Bar & Refresh Button Controls */}
      <div className="customer-header-bar">
        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            placeholder="ગ્રાહક શોધો... / Search Customer"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          className="btn-icon"
          style={{
            border: '2px solid var(--border-color)',
            height: '48px',
            width: '48px',
            borderRadius: '0.75rem',
          }}
          onClick={() => fetchCustomersList(true)}
          disabled={loading || refreshing}
          title="Refresh List"
          aria-label="Refresh Customer List"
        >
          <RotateCcw className={refreshing ? 'animate-spin' : ''} size={22} />
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0' }}>
          <Loader2 className="animate-spin" size={40} color="#2563eb" />
          <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '1.1rem' }}>
            ગ્રાહકોની યાદી લોડ થઈ રહી છે... / Loading customers...
          </p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        /* Empty State */
        <div className="placeholder-card">
          <div style={{
            width: '64px',
            height: '64px',
            backgroundColor: '#eff6ff',
            color: '#2563eb',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={32} />
          </div>
          <h2 className="placeholder-title">
            {searchQuery ? 'કોઈ પરિણામ મળ્યું નથી / No Results Found' : 'હજી સુધી કોઈ ગ્રાહક નથી / Abhi koi customer nahi hai'}
          </h2>
          <p className="placeholder-text">
            {searchQuery
              ? 'અન્ય નામથી શોધો. / Try searching with another name.'
              : 'હોમ સ્ક્રીન પર બોલીને નવો ઉધાર અથવા જમા સેવ કરો. / Record new transactions on Home screen.'}
          </p>
        </div>
      ) : (
        /* Customer List */
        <div className="customer-list">
          {filteredCustomers.map((customer) => {
            const udhaarVal = Number(customer.totalUdhaar) || 0;
            const hasUdhaar = udhaarVal > 0;

            return (
              <div
                key={customer.customerId}
                className="customer-card"
                onClick={() => navigate(`/customers/${customer.customerId}`, { state: { customer } })}
              >
                <div className="customer-info">
                  <div className="customer-name">{customer.name}</div>
                  {customer.phone && customer.phone !== '0000000000' && (
                    <div className="customer-phone">
                      <Phone size={14} />
                      {customer.phone}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="udhaar-amount-badge">
                    <div className={`udhaar-amount-val ${hasUdhaar ? 'has-udhaar' : 'zero-udhaar'}`}>
                      ₹{udhaarVal}
                    </div>
                    <div className="udhaar-label">
                      {hasUdhaar ? 'બાકી ઉધાર' : 'જમા ચૂકવ્યું'}
                    </div>
                  </div>
                  <ChevronRight size={22} color="#94a3b8" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
