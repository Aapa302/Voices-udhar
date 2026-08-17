import React from 'react';
import { Store } from 'lucide-react';

export default function Header({ shopName }) {
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Store size={26} />
        <div>
          <div className="app-title">વોઇસ ઉધાર</div>
          <div className="app-subtitle">{shopName || 'Voice Udhar'}</div>
        </div>
      </div>
    </header>
  );
}
