import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './styles.css';
import { AppProvider, useApp } from './lib/store';
import Shell from './components/Shell';
import { Icon } from './components/ui';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectPage from './pages/ProjectPage';
import Templates from './pages/Templates';
import RecentFiles from './pages/RecentFiles';
import TasksPage from './pages/TasksPage';
import CalendarPage from './pages/CalendarPage';
import VaultPage from './pages/VaultPage';
import Assistant from './pages/Assistant';
import NotesPage from './pages/NotesPage';
import ActivityPage from './pages/ActivityPage';
import StoragePage from './pages/StoragePage';
import SettingsPage from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 8000 },
  },
});

function Splash() {
  return (
    <div className="auth-shell">
      <div className="auth-glow" />
      <div className="col" style={{ alignItems: 'center', gap: 16, zIndex: 1 }}>
        <div className="brand-mark" style={{ width: 46, height: 46, borderRadius: 13 }}>
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <path d="M9 23V9l14 14V9" stroke="currentColor" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ letterSpacing: '0.28em', fontWeight: 700, fontSize: 14 }}>NEXUS</div>
        <span className="spinner" />
      </div>
    </div>
  );
}

function Guard({ children }) {
  const { user, booting } = useApp();
  if (booting) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="page center" style={{ minHeight: '70vh' }}>
      <div className="empty">
        <div className="empty-icon"><Icon name="compass" size={22} /></div>
        <h3>Page not found</h3>
        <p>That route doesn't exist inside your workspace.</p>
        <a className="btn btn-primary" href="/" style={{ marginTop: 16 }}>Back to Dashboard</a>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard><Shell /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectPage />} />
        <Route path="templates" element={<Templates />} />
        <Route path="files" element={<RecentFiles />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
