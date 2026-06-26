import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Send the session cookie on every API call. The cookie is HttpOnly and set on the backend's
// domain, so cross-site requests (Vercel → Railway) only include it with credentials:"include".
// Patch fetch once here so all existing call sites get it without per-call changes.
const API = import.meta.env.VITE_API_URL || "http://localhost:8000"

// After Spotify login the backend redirects with the session token in the URL fragment
// (#session=...). Stash it and clean the URL. We send it as a Bearer header on every API call,
// which works across the Vercel↔Railway domain split even when third-party cookies are blocked.
try {
  const m = window.location.hash.match(/[#&]session=([^&]+)/)
  if (m) {
    localStorage.setItem("fidolio_token", decodeURIComponent(m[1]))
    window.history.replaceState(null, "", window.location.pathname + window.location.search)
  }
} catch {}

const _fetch = window.fetch.bind(window)
window.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : (input && input.url) || ""
  if (url.startsWith(API)) {
    // Bearer token (not cookies) is our auth — so NO credentials:"include". That keeps requests
    // "non-credentialed", where allow_headers:"*" is a real wildcard and the Authorization header is
    // permitted through CORS preflight. (With credentials, "*" is literal and Authorization is blocked.)
    const tok = localStorage.getItem("fidolio_token")
    init = { ...init, headers: { ...(init.headers || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) } }
  }
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
