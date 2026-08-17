import React from 'react';
import { Users } from 'lucide-react';

export default function CustomersScreen() {
  return (
    <div className="main-content">
      <div className="placeholder-card">
        <div style={{
          width: '64px',
          height: '64px',
          backgroundColor: '#fef3c7',
          color: '#d97706',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Users size={32} />
        </div>
        <h2 className="placeholder-title">ગ્રાહકો / Customers</h2>
        <p className="placeholder-text">
          ગ્રાહકોની યાદી અહીં ટૂંક સમયમાં બતાવવામાં આવશે.
        </p>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
          Customer list data will be added here in a later task.
        </p>
      </div>
    </div>
  );
}
