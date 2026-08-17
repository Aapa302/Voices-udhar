import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (!import.meta.env.VITE_API_URL) {
  console.warn(
    '[Voice Udhar] VITE_API_URL environment variable is missing or empty. API calls will default to relative paths, which may fail in production if backend is hosted separately.'
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
