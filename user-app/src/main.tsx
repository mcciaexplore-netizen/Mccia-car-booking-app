import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mccia.css'
import './app.css'
import Root from './Root.tsx'
import SSOCallback from './SSOCallback.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/sso/callback' ? <SSOCallback /> : <Root />}
  </StrictMode>,
)
