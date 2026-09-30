import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
// import './style.css' // Optional if there's no existing global CSS needed

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
