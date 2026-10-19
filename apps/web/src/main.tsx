import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Dev only: VITE_MOCK=1 serves fixture API responses. The branch is removed from production builds.
if (import.meta.env.VITE_MOCK) await import('./mock')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
