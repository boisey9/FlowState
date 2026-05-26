import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './trade-banana-theme.css'
import './trade-banana-mobile-fixes.css'
import TradeBananaRouter from './TradeBananaRouter.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TradeBananaRouter />
  </React.StrictMode>,
)