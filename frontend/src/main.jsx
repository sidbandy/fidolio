import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Send the session cookie on every API call. The cookie is HttpOnly and set on the backend's
// domain, so cross-site requests (Vercel → Railway) only include it with credentials:"include".
// Patch fetch once here so all existing call sites get it without per-call changes.
const API = import.meta.env.VITE_API_URL || "http://localhost:8000"
const _fetch = window.fetch.bind(window)
window.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : (input && input.url) || ""
  if (url.startsWith(API)) init = { ...init, credentials: "include" }
  return _fetch(input, init)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register the service worker for installability (PWA / Add to Home Screen)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
