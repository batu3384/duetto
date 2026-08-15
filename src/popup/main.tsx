import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/popup.css';
import { bundledFontFaceCss } from '../services/subtitleLook';

if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
  const fontStyle = document.createElement('style');
  fontStyle.textContent = bundledFontFaceCss((file) => chrome.runtime.getURL(`fonts/${file}`));
  document.head.appendChild(fontStyle);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
