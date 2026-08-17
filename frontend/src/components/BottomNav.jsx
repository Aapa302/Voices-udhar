import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users } from 'lucide-react';

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Bottom Navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Home className="nav-icon" />
        <span>હોમ / Home</span>
      </NavLink>

      <NavLink
        to="/customers"
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Users className="nav-icon" />
        <span>ગ્રાહકો / Customers</span>
      </NavLink>
    </nav>
  );
}
