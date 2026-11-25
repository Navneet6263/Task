import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { installSmoothWheel } from './services/smoothWheel';

// Calmer, gliding mouse-wheel scrolling on every page (see the file for what it leaves alone).
installSmoothWheel();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
