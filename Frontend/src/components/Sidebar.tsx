import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  KanbanSquare,
  CheckSquare,
  Users,
  UserCheck,
  Settings,
  Plus,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  Layers,
  Bell,
} from 'lucide-react';
import { useStore, ActiveView } from '../store/useStore';
import { Avatar } from './Avatar';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onCloseMobile }) => {
  const {
    activeView,
    setActiveView,
    theme,
    toggleTheme,
    currentUser,
    logout,
    projects,
    activeProjectId,
    selectProject,
    setNewTaskModalOpen,
    setAuthModalOpen,
    unreadCount,
  } = useStore();

  const navItems: { id: ActiveView; label: string; icon: React.FC<any> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'board', label: 'Kanban Board', icon: KanbanSquare },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'tasks', label: 'All Tasks', icon: CheckSquare },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'team', label: 'Team Members', icon: Users },
    { id: 'profile', label: 'My Profile', icon: UserCheck },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (view: ActiveView) => {
    setActiveView(view);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Lockup */}
        <div className="h-16 px-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs group-hover:bg-blue-700 transition-colors">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              TaskFlow
            </span>
          </div>

          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Action Button */}
        <div className="p-4 shrink-0">
          <button
            onClick={() => {
              setNewTaskModalOpen(true);
              onCloseMobile();
            }}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Task</span>
          </button>
        </div>

        {/* Workspace Project Selector */}
        {projects.length > 0 && (
          <div className="px-4 pb-2 shrink-0">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1.5 px-1">
              Active Project
            </label>
            <div className="relative">
              <select
                value={activeProjectId || ''}
                onChange={(e) => {
                  selectProject(e.target.value);
                  if (activeView !== 'board') setActiveView('board');
                }}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 rounded-lg py-2 pl-3 pr-8 truncate focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 px-3 py-1">
            Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span className="truncate flex-1">{item.label}</span>
                {item.id === 'notifications' && unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Account / Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          {currentUser ? (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <div
                onClick={() => handleNavClick('profile')}
                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
              >
                <Avatar name={currentUser.name} avatar={currentUser.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate capitalize">
                    {currentUser.role.replace('_', ' ')}
                  </div>
                </div>
              </div>

              <button
                onClick={logout}
                title="Sign out"
                aria-label="Sign out"
                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full py-2 px-3 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
            >
              Sign In / Register
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
