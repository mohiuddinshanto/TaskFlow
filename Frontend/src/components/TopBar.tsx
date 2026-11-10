import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  CheckCheck,
  Plus,
  X,
  Clock,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar } from './Avatar';

interface TopBarProps {
  onOpenMobileSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenMobileSidebar }) => {
  const {
    activeView,
    projects,
    activeProjectId,
    searchQuery,
    setSearchQuery,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    setNewTaskModalOpen,
    currentUser,
  } = useStore();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getBreadcrumb = () => {
    switch (activeView) {
      case 'dashboard':
        return 'Overview & Analytics';
      case 'board':
        return activeProject ? activeProject.name : 'Kanban Board';
      case 'projects':
        return 'Project Directory';
      case 'tasks':
        return 'All Workspace Tasks';
      case 'team':
        return 'Team Directory';
      case 'profile':
        return 'My Profile';
      case 'settings':
        return 'Workspace Settings';
      default:
        return 'TaskFlow';
    }
  };

  return (
    <header className="h-16 px-4 md:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
      {/* Zone 1: Mobile Hamburger & Contextual Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          aria-label="Open mobile menu"
          className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 rounded-md md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 truncate">
          <span className="font-semibold text-slate-900 dark:text-slate-100 hidden sm:inline">
            TaskFlow
          </span>
          <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">/</span>
          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
            {getBreadcrumb()}
          </span>
        </div>
      </div>

      {/* Zone 2: Search input */}
      <div className="flex-1 max-w-md hidden sm:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tasks, labels, descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Zone 3: Actions & Notifications & User Switcher */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => setNewTaskModalOpen(true)}
          className="hidden lg:flex items-center gap-1.5 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Task</span>
        </button>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            aria-label="Notifications"
            className="relative p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
              <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium tabular-nums">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No notifications right now.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => markNotificationRead(notif.id)}
                      className={`p-3 text-xs transition-colors cursor-pointer flex gap-3 items-start ${
                        notif.isRead
                          ? 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          : 'bg-blue-50/60 dark:bg-blue-950/30 text-slate-900 dark:text-slate-100 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                      }`}
                    >
                      <div
                        className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                          notif.isRead ? 'bg-transparent' : 'bg-blue-600'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(notif.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-1.5">
            {currentUser && (
              <Avatar name={currentUser.name} avatar={currentUser.avatar} size="xs" />
            )}
            <span className="hidden xl:inline text-xs font-medium text-slate-700 dark:text-slate-300">
              {currentUser?.name.split(' ')[0]}
            </span>
            <span className="text-[10px] hidden md:inline px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono capitalize">
              {currentUser?.role.replace('_', ' ')}
            </span>
        </div>
      </div>
    </header>
  );
};
