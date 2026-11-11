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
