import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RotateCcw, Phone, ChevronRight, Loader2, Users, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
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

    const handleShopChanged = () => {
      fetchCustomersList();
    };

    window.addEventListener('voice_udhar_shop_changed', handleShopChanged);
    return () => {
      window.removeEventListener('voice_udhar_shop_changed', handleShopChanged);
    };
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
        <motion.button
          whileTap={{ scale: 0.92 }}
          className="btn-icon"
          style={{
            height: '48px',
            width: '48px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.12)'
          }}
          onClick={() => fetchCustomersList(true)}
          disabled={loading || refreshing}
          title="Refresh List"
          aria-label="Refresh Customer List"
        >
          <RotateCcw className={refreshing ? 'animate-spin' : ''} size={22} color="#F0C674" />
        </motion.button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <Loader2 className="animate-spin" size={44} color="#C026D3" />
          <p style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '1.1rem', fontWeight: '600' }}>
            ગ્રાહકોની યાદી લોડ થઈ રહી છે... / Loading customers...
          </p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        /* Empty State */
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="placeholder-card">
          <div style={{
            width: '72px',
            height: '72px',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(192, 38, 211, 0.25) 100%)',
            color: '#F0C674',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(124, 58, 237, 0.2)',
            border: '1px solid rgba(240, 198, 116, 0.3)'
          }}>
            <Users size={36} />
          </div>
          <h2 className="placeholder-title">
            {searchQuery ? 'કોઈ પરિણામ મળ્યું નથી / No Results Found' : 'હજી સુધી કોઈ ગ્રાહક નથી / Abhi koi customer nahi hai'}
          </h2>
          <p className="placeholder-text">
            {searchQuery
              ? 'અન્ય નામથી શોધો. / Try searching with another name.'
              : 'હોમ સ્ક્રીન પર બોલીને નવો ઉધાર અથવા જમા સેવ કરો. / Record new transactions on Home screen.'}
          </p>
        </motion.div>
      ) : (
        /* Customer List */
        <div className="customer-list">
          {filteredCustomers.map((customer, index) => {
            const udhaarVal = Number(customer.totalUdhaar) || 0;
            const hasUdhaar = udhaarVal > 0;
            const hasRealPhone = customer.phone && customer.phone !== '0000000000';

            return (
              <motion.div
                key={customer.customerId}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04 }}
                whileTap={{ scale: 0.98 }}
                className={`customer-card ${hasUdhaar ? 'high-udhaar' : 'zero-udhaar'}`}
                onClick={() => navigate(`/customers/${customer.customerId}`, { state: { customer } })}
              >
                <div className="customer-info">
                  <div className="customer-name">{customer.name}</div>
                  {hasRealPhone ? (
                    <div className="customer-phone">
                      <Phone size={14} color="#94A3B8" />
                      {customer.phone}
                    </div>
                  ) : (
                    <div className="customer-phone" style={{ color: '#FDA4AF', fontSize: '0.78rem' }}>
                      <AlertTriangle size={12} color="#F43F5E" />
                      નંબર નથી / Phone not captured
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div className="udhaar-amount-badge">
                    <div className={`udhaar-amount-val ${hasUdhaar ? 'has-udhaar' : 'zero-udhaar'}`}>
                      ₹{udhaarVal}
                    </div>
                    <div className="udhaar-label">
                      {hasUdhaar ? 'બાકી ઉધાર' : 'જમા ચૂકવ્યું'}
                    </div>
                  </div>
                  <ChevronRight size={22} color="#64748B" />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
