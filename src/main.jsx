import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TradeBananaRebrand from './components/TradeBananaRebrand.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TradeBananaRebrand />
    <App />
  </React.StrictMode>,
)
