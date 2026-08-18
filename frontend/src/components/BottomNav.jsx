import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Bell, PieChart } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BottomNav() {
  const navItems = [
    { to: '/', label: 'હોમ / Home', icon: Home, end: true },
    { to: '/customers', label: 'ગ્રાહકો / Customers', icon: Users, end: false },
    { to: '/alerts', label: 'અલર્ટ્સ / Alerts', icon: Bell, end: false },
    { to: '/summary', label: 'તારણ / Summary', icon: PieChart, end: false },
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
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', width: '100%', zIndex: 2 }}
                >
                  <Icon className="nav-icon" size={22} color={isActive ? '#F0C674' : '#64748B'} />
                  <span style={{ color: isActive ? '#F0C674' : '#64748B', fontWeight: isActive ? '800' : '500' }}>
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
