import React from 'react';
import { Store, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Header({ shopName }) {
  return (
    <motion.header
      className="app-header"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(192, 38, 211, 0.3) 100%)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(240, 198, 116, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 15px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        }}>
          <Store size={22} color="#F0C674" />
        </div>
        <div>
          <div className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="gold-gradient-text">વોઇસ ઉધાર</span>
            <Sparkles size={14} color="#F0C674" />
          </div>
          <div className="app-subtitle">{shopName || 'Voice Udhar'}</div>
        </div>
      </div>
    </motion.header>
  );
}
