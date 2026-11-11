import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Check,
  Clock,
  ArrowRight,
  FolderKanban,
  CheckSquare,
  MessageSquare,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Notification, NotificationType } from '../types/index';

export const NotificationsView: React.FC = () => {
  const {
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    selectProject,
    openTaskModal,
    setActiveView,
  } = useStore();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = notifications.filter((n) => (filter === 'unread' ? !n.isRead : true));

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'task_assigned':
        return <CheckSquare className="w-4 h-4 text-blue-500" />;
      case 'project_invited':
        return <FolderKanban className="w-4 h-4 text-emerald-500" />;
      case 'deadline_approaching':
        return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case 'comment_added':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'status_changed':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'project_role_changed':
        return <Users className="w-4 h-4 text-indigo-500" />;
      case 'ownership_transferred':
        return <FolderKanban className="w-4 h-4 text-blue-500" />;
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.isRead) {
      await markNotificationRead(notif.id);
    }
    if (notif.relatedTaskId) {
      openTaskModal(notif.relatedTaskId);
    } else if (notif.relatedProjectId) {
      selectProject(notif.relatedProjectId);
      setActiveView('board');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold tabular-nums">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Stay informed on task assignments, comments, project invitations, and approaching deadlines.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="py-2 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-medium">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filter === 'unread'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <span className="text-xs text-slate-400 tabular-nums">
          Showing {filtered.length} {filtered.length === 1 ? 'notification' : 'notifications'}
        </span>
      </div>

      {/* Notification List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <Bell className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              No notifications here
            </div>
            <p>You're all caught up with your workspace updates.</p>
          </div>
        ) : (
          filtered.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`p-4 flex items-start justify-between gap-4 transition-colors cursor-pointer group ${
                notif.isRead
                  ? 'bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 text-slate-900 dark:text-slate-100 font-medium'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                  {getNotificationIcon(notif.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed">{notif.message}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(notif.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {!notif.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!notif.isRead ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markNotificationRead(notif.id);
                    }}
                    title="Mark as read"
                    className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                ) : (
                  <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
