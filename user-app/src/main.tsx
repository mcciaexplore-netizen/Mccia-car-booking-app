import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mccia.css'
import './app.css'
import Root from './Root.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
