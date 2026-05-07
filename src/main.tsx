import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Handle Google OAuth redirect inside the popup window.
// When the popup lands back on our app URL with ?code=..., we forward the
// code to the opener and close — no React needed.
const _urlParams = new URLSearchParams(window.location.search)
const _oauthCode  = _urlParams.get('code')
const _oauthError = _urlParams.get('error')
if (window.opener && (_oauthCode || _oauthError)) {
  window.opener.postMessage(
    { type: 'gd_oauth_code', code: _oauthCode, error: _oauthError },
    '*',
  )
  window.close()
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
