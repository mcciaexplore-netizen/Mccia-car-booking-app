import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mccia.css'
import './admin.css'
import App from './App.tsx'
import SSOCallback from './SSOCallback.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/sso/callback' ? <SSOCallback /> : <App />}
  </StrictMode>,
)
