import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Sun, Moon, Database, ShieldAlert, CheckCircle2, RefreshCw, HardDrive } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export const SettingsView: React.FC = () => {
  const { theme, toggleTheme, currentUser, fetchDashboardStats, fetchProjects, fetchTasks } = useStore();
  const [isResetting, setIsResetting] = useState(false);
  const [dbStatus, setDbStatus] = useState<any>(null);

  useEffect(() => {
    api.get<any>('/api/dashboard/status')
      .then(setDbStatus)
      .catch(() => {});
  }, []);

  const handleResetData = async () => {
    if (!window.confirm('Reset all demo data back to default factory baseline? Any new custom items will be restored.')) {
      return;
    }
    setIsResetting(true);
    try {
      await api.post('/api/dashboard/reset-data');
      toast.success('Workspace reset to baseline sample data');
      await fetchProjects();
      await fetchTasks();
      await fetchDashboardStats();
      const status = await api.get<any>('/api/dashboard/status');
      setDbStatus(status);
    } catch (err: any) {
      toast.error(err.message || 'Could not reset workspace');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Workspace Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Configure appearance, theme preferences, and data maintenance.
        </p>
      </div>

      {/* Theme Settings */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Interface Theme
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Switch between clean SaaS light mode and high-contrast dark theme.
            </p>
          </div>

          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 py-2 px-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-800 dark:text-slate-200 transition-colors"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-500" />
                <span>Switch to Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-600" />
                <span>Switch to Dark</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Admin Maintenance */}
      {currentUser?.role === 'admin' && (
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Database className="w-4 h-4 text-blue-600" />
            <span>Developer &amp; Admin Maintenance</span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Quickly restore the initial factory seed dataset (Alex Morgan, Sarah Connor, Michael Chen, initial tasks, and Kanban columns) for demonstration or evaluation purposes.
          </p>

          <div className="pt-1">
            <button
              onClick={handleResetData}
              disabled={isResetting}
              className="py-2 px-3.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Restoring...' : 'Restore Default Seed Data'}</span>
            </button>
          </div>
        </div>
      )}

      {/* System Specifications Card */}
      <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Database &amp; Architecture Details
          </span>
          {dbStatus && (
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
              {dbStatus.mode}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-slate-500 dark:text-slate-400 text-[11px]">
          <div>
            <span className="block text-slate-400">Framework</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">React 19 + Vite + Express</span>
          </div>
          <div>
            <span className="block text-slate-400">Driver</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">MongoDB Native Driver / Dual-Mode</span>
          </div>
          <div>
            <span className="block text-slate-400">Authentication</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">JWT + bcrypt (BcryptJS)</span>
          </div>
          <div>
            <span className="block text-slate-400">Active Records</span>
            <span className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
              {dbStatus?.counts ? `${dbStatus.counts.projects} projects · ${dbStatus.counts.tasks} tasks · ${dbStatus.counts.users} users` : 'Loading...'}
            </span>
          </div>
          <div>
            <span className="block text-slate-400">State Management</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Zustand</span>
          </div>
          <div>
            <span className="block text-slate-400">Unit Tests</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Node:Test / TSX (10 passing)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
