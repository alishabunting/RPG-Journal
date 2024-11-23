import React from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route } from "wouter";
import "./index.css";
import NotFound from "./components/NotFound";
// Enhanced error handling and HMR configuration
const MAX_RETRY_COUNT = 3;
let retryCount = 0;
let reconnectTimeout: number | null = null;

if (import.meta.hot) {
  const handleConnectionError = (error: any) => {
    console.warn('HMR Connection error:', error);
    if (retryCount < MAX_RETRY_COUNT) {
      retryCount++;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      reconnectTimeout = window.setTimeout(() => {
        console.log(`Attempting to reconnect (${retryCount}/${MAX_RETRY_COUNT})...`);
        import.meta.hot?.send('vite:reconnect');
      }, 1000 * retryCount);
    }
  };

  import.meta.hot.on('vite:beforeUpdate', () => {
    console.log('Hot update pending...');
  });
  
  import.meta.hot.on('vite:afterUpdate', () => {
    console.log('Hot update applied successfully');
    retryCount = 0; // Reset retry count on successful update
  });
  
  import.meta.hot.on('vite:error', handleConnectionError);
  
  import.meta.hot.on('vite:ws:disconnect', () => {
    console.log('WebSocket disconnected');
    handleConnectionError(new Error('WebSocket disconnected'));
  });
  
  import.meta.hot.on('vite:ws:connect', () => {
    console.log('WebSocket connected successfully');
    retryCount = 0;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  });
}

// Global error boundary for unhandled promises
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  const error = event.reason;
  console.warn('Unhandled Promise Rejection:', {
    message: error?.message || 'Unknown error',
    stack: error?.stack,
    details: error
  });
});

// Storage context provider
import { StorageProvider } from "./lib/storage-context";
import { Toaster } from "./components/ui/toaster";
import Home from "./pages/Home";
import Auth from "./pages/Auth";

// Initialize storage if not already done
const user = localStorage.getItem('rpg-journal:user');
if (!user) {
  localStorage.setItem('rpg-journal:user', JSON.stringify({
    id: Math.random().toString(36).substring(2),
    username: 'Guest',
    character: {
      name: 'New Adventurer',
      class: 'Warrior',
      avatar: '/avatars/warrior.svg',
      level: 1,
      xp: 0,
      stats: {
        wellness: 1,
        social: 1,
        growth: 1,
        achievement: 1
      },
      achievements: []
    }
  }));
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <React.StrictMode>
    <StorageProvider>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth" component={Auth} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </StorageProvider>
  </React.StrictMode>
);
