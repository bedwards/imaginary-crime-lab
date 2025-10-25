import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'
import './index.css';

// Hide loading spinner
const loadingElement = document.getElementById('loading');
if (loadingElement) {
  loadingElement.classList.add('hidden');
}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
