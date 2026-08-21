import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Menu } from 'lucide-react';
import { motion } from 'framer-motion';
import { getCustomerAlerts, getCustomerReminders } from '../api/customers';
import { getInventoryApi } from '../api/inventory';

export default function BottomNav() {
  const [hasUrgentBadge, setHasUrgentBadge] = useState(false);

  useEffect(() => {
    const checkAlertsBadge = async () => {
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

        setHasUrgentBadge(longPendingCount + remindersCount + lowStockCount > 0);
      } catch (err) {
        console.warn('Failed to check badge status for bottom nav:', err);
      }
    };

    checkAlertsBadge();

    const handleShopChanged = () => checkAlertsBadge();
    window.addEventListener('voice_udhar_shop_changed', handleShopChanged);
    return () => window.removeEventListener('voice_udhar_shop_changed', handleShopChanged);
  }, []);

  const navItems = [
    { to: '/', label: 'હોમ / Home', icon: Home, end: true },
    { to: '/customers', label: 'ગ્રાહકો / Customers', icon: Users, end: false },
    { to: '/more', label: 'વધુ / More', icon: Menu, end: false, hasBadge: hasUrgentBadge },
  ];

  return (
    <nav className="bottom-nav" aria-label="Bottom Navigation">
      {navItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <motion.div
                  whileTap={{ scale: 0.88 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', zIndex: 2, position: 'relative' }}
                >
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon className="nav-icon" size={24} color={isActive ? '#F0C674' : '#64748B'} />
                    {item.hasBadge && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-2px',
                          right: '-4px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: '#EF4444',
                          border: '2px solid #0A0A0F',
                          boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
                        }}
                      />
                    )}
                  </div>
                  <span style={{ color: isActive ? '#F0C674' : '#64748B', fontWeight: isActive ? '800' : '600', fontSize: '0.8rem' }}>
                    {item.label}
                  </span>
                </motion.div>

                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    style={{
                      position: 'absolute',
                      inset: '6px 8px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(192, 38, 211, 0.2) 100%)',
                      border: '1px solid rgba(240, 198, 116, 0.25)',
                      boxShadow: '0 0 15px rgba(124, 58, 237, 0.2)',
                      zIndex: 1
                    }}
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
