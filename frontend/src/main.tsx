import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'bulma/css/bulma.min.css'
import './styles.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
