import React from 'react';
import ReactDOM from 'react-dom/client';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';

// Configure axios defaults
import axios from 'axios';
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <AuthProvider>
        <CssBaseline />
        <App />
      </AuthProvider>
    </LocalizationProvider>
  </React.StrictMode>
);
