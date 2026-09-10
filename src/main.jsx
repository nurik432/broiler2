// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // <-- Импортируем
import App from './App';
import './index.css';
import { installTelegramMock } from './mobile/telegram/mockTelegram';

installTelegramMock();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> {/* <-- Оборачиваем App */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
