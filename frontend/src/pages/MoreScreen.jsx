import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PieChart, Package, Bell, Settings, ChevronRight } from 'lucide-react';
import { getCustomerAlerts, getCustomerReminders } from '../api/customers';
import { getInventoryApi } from '../api/inventory';

export default function MoreScreen() {
  const navigate = useNavigate();

  // Urgent alerts state
  const [hasUrgentAlerts, setHasUrgentAlerts] = useState(false);
  const [alertDetails, setAlertDetails] = useState('');

  // Check urgent items for badge & subtext
  useEffect(() => {
    const checkUrgentItems = async () => {
      const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
      if (!shopkeeperId) return;

      try {
        const [alertsRes, remindersRes, inventoryRes] = await Promise.all([
          getCustomerAlerts(shopkeeperId, 15).catch(() => ({ longPending: [] })),
          getCustomerReminders(shopkeeperId, 30).catch(() => ({ remindersNeeded: [] })),
          getInventoryApi(shopkeeperId).catch(() => []),
        ]);

        const longPendingCount = (alertsRes && alertsRes.longPending && alertsRes.longPending.length) || 0;
        const remindersCount = (remindersRes && remindersRes.remindersNeeded && remindersRes.remindersNeeded.length) || 0;
        const lowStockCount = (inventoryRes || []).filter(
          (item) => item.isLowStock || Number(item.quantity) <= Number(item.lowStockThreshold || 5)
        ).length;

        const totalUrgent = longPendingCount + remindersCount + lowStockCount;
        if (totalUrgent > 0) {
          setHasUrgentAlerts(true);
          const parts = [];
          if (longPendingCount > 0) parts.push(`${longPendingCount} બાકી ઉધાર`);
          if (remindersCount > 0) parts.push(`${remindersCount} રિમાઇન્ડર`);
          if (lowStockCount > 0) parts.push(`${lowStockCount} ઓછો સ્ટોક`);
          setAlertDetails(parts.join(' • '));
        } else {
          setHasUrgentAlerts(false);
          setAlertDetails('');
        }
      } catch (err) {
        console.warn('Failed to check alerts on More screen:', err);
      }
    };

    checkUrgentItems();
  }, []);

  // Menu items list (Ask a Question removed since it moved back to Home screen)
  const menuItems = [
    {
      id: 'summary',
      title: 'તારણ / Summary',
      subtitle: 'દૈનિક, સાપ્તાહિક અને માસિક રિપોર્ટ / Sales & balance reports',
      icon: PieChart,
      iconBg: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(192, 38, 211, 0.3) 100%)',
      iconColor: '#C084FC',
      borderAccent: 'rgba(192, 132, 252, 0.3)',
      onClick: () => navigate('/summary'),
    },
    {
      id: 'stock',
      title: 'સ્ટોક / Stock',
      subtitle: 'વસ્તુઓની યાદી અને જથ્થો / Inventory management',
      icon: Package,
      iconBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.25) 100%)',
      iconColor: '#FBBF24',
      borderAccent: 'rgba(251, 191, 36, 0.3)',
      onClick: () => navigate('/inventory'),
    },
    {
      id: 'alerts',
      title: 'અલર્ટ્સ / Alerts',
      subtitle: alertDetails || 'બાકી રિમાઇન્ડર્સ અને ઓછો સ્ટોક / Pending alerts & low stock',
      icon: Bell,
      iconBg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(225, 29, 72, 0.25) 100%)',
      iconColor: '#FCA5A5',
      borderAccent: 'rgba(252, 165, 165, 0.3)',
      badge: hasUrgentAlerts ? '!' : null,
      onClick: () => navigate('/alerts'),
    },
    {
      id: 'settings',
      title: 'સેટિંગ્સ / Settings',
      subtitle: 'UPI ID, દુકાન મેનેજમેન્ટ, ડેટા એક્સપોર્ટ / Settings & Data export',
      icon: Settings,
      iconBg: 'linear-gradient(135deg, rgba(240, 198, 116, 0.25) 0%, rgba(217, 119, 6, 0.25) 100%)',
      iconColor: '#F0C674',
      borderAccent: 'rgba(240, 198, 116, 0.3)',
      onClick: () => {
        const settingsBtn = document.querySelector('button[title="સેટિંગ્સ / Settings"]');
        if (settingsBtn) {
          settingsBtn.click();
        } else {
          alert('Header settings button clicked');
        }
      },
    },
  ];

  return (
    <div className="main-content" style={{ paddingBottom: '6rem' }}>
      {/* Screen Title */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#F8FAFC', margin: 0 }}>
            વધુ સુવિધાઓ / More
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: '0.2rem', margin: 0 }}>
            બધી વધારાની સુવિધાઓ / Additional tools & settings
          </p>
        </div>
      </div>

      {/* Menu Options List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {menuItems.map((item, index) => {
          const Icon = item.icon;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={item.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.15rem 1.1rem',
                borderRadius: '16px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${item.borderAccent}`,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                minHeight: '72px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: item.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${item.borderAccent}`,
                }}>
                  <Icon size={26} color={item.iconColor} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '1.1rem',
                    fontWeight: '800',
                    color: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span>{item.title}</span>
                    {item.badge && (
                      <span style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                        fontSize: '0.75rem',
                        fontWeight: '900',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '0.825rem',
                    color: '#94A3B8',
                    marginTop: '0.2rem',
                    fontWeight: '500',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.subtitle}
                  </div>
                </div>
              </div>

              <ChevronRight size={22} color="#64748B" style={{ flexShrink: 0, marginLeft: '0.5rem' }} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
