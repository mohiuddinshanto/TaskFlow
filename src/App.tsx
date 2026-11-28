import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { KanbanBoardView } from './components/KanbanBoardView';
import { ProjectsView } from './components/ProjectsView';
import { TasksListView } from './components/TasksListView';
import { TeamView } from './components/TeamView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { NotificationsView } from './components/NotificationsView';
import { TaskDetailModal } from './components/TaskDetailModal';
import { NewTaskModal } from './components/NewTaskModal';
import { NewProjectModal } from './components/NewProjectModal';
import { AuthModal } from './components/AuthModal';

export default function App() {
  const {
    activeView,
    theme,
    checkAuth,
    isLoadingAuth,
  } = useStore();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const currentUserId = useStore((state) => state.currentUser?.id);

  // Keep this user's views in sync with successful changes made by collaborators.
  useEffect(() => {
    if (!currentUserId) return;
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let retryDelay = 1000;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
      socket.onopen = () => { retryDelay = 1000; };
      socket.onmessage = (event) => {
        try {
          if (JSON.parse(event.data).type !== 'data_changed') return;
        } catch { return; }
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          const state = useStore.getState();
          void state.fetchProjectCategories();
          void state.fetchProjects();
          void state.fetchNotifications();
          void state.fetchDashboardStats();
          if (state.activeProjectId) void state.fetchTasks(state.activeProjectId);
          if (state.selectedTaskId) void state.fetchComments(state.selectedTaskId);
        }, 120);
      };
      socket.onclose = () => {
        if (stopped) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      socket?.close();
    };
  }, [currentUserId]);

  // Sync theme class with document element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Restore the current user's authenticated session on page load.
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'board':
        return <KanbanBoardView />;
      case 'projects':
        return <ProjectsView />;
      case 'tasks':
        return <TasksListView />;
      case 'notifications':
        return <NotificationsView />;
      case 'team':
        return <TeamView />;
      case 'profile':
        return <ProfileView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased">
      {/* Toast Notification Container */}
      <Toaster
        position="top-right"
        toastOptions={{
          className:
            'dark:bg-slate-900 dark:text-slate-100 dark:border dark:border-slate-800 text-xs shadow-lg rounded-xl',
          duration: 3000,
        }}
      />

      {/* Main Sidebar */}
      <Sidebar
        isOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopBar onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          {isLoadingAuth ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            renderActiveView()
          )}
        </main>
      </div>

      {/* Global Modals */}
      <TaskDetailModal />
      <NewTaskModal />
      <NewProjectModal />
      <AuthModal />
    </div>
  );
}
