import React from 'react';
import { Store, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Header({ shopName }) {
  return (
    <motion.header
      className="app-header"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}>
          <Store size={24} color="#F59E0B" />
        </div>
        <div>
          <div className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>વોઇસ ઉધાર</span>
            <Sparkles size={14} color="#F59E0B" />
          </div>
          <div className="app-subtitle">{shopName || 'Voice Udhar'}</div>
        </div>
      </div>
    </motion.header>
  );
}
