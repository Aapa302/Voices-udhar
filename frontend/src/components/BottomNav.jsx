import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, PieChart } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BottomNav() {
  const navItems = [
    { to: '/', label: 'હોમ / Home', icon: Home, end: true },
    { to: '/customers', label: 'ગ્રાહકો / Customers', icon: Users, end: false },
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
                  whileTap={{ scale: 0.85 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%' }}
                >
                  <Icon className="nav-icon" size={22} color={isActive ? '#6D28D9' : '#64748B'} />
                  <span style={{ color: isActive ? '#4C1D95' : '#64748B' }}>{item.label}</span>
                </motion.div>
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    style={{
                      position: 'absolute',
                      top: 0,
                      width: '40px',
                      height: '3px',
                      borderRadius: '0 0 4px 4px',
                      background: 'linear-gradient(90deg, #4C1D95, #F59E0B)',
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
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
