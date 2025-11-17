import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'bulma/css/bulma.min.css'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import './i18n'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
