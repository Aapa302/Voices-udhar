import React from 'react';
import { Mic } from 'lucide-react';

export default function HomeScreen() {
  return (
    <div className="main-content">
      <div className="placeholder-card">
        <div style={{
          width: '64px',
          height: '64px',
          backgroundColor: '#dbeafe',
          color: '#2563eb',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Mic size={32} />
        </div>
        <h2 className="placeholder-title">હોમ / Home</h2>
        <p className="placeholder-text">
          અહીં અવાજ રેકોર્ડિંગ ટૂંક સમયમાં ઉમેરવામાં આવશે.
        </p>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
          Voice recording will be added here in the next task.
        </p>
      </div>
    </div>
  );
}
