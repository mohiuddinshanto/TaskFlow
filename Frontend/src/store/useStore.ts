import { create } from 'zustand';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import {
  User,
  CreateProjectInput,
  Project,
  Task,
  Comment,
  Notification,
  DashboardStats,
  TaskFilterOptions,
  TaskStatus,
} from '../types/index';
import { countUnreadNotifications } from '../utils/taskCalculations';
import { authClient } from '../lib/auth-client';
import { errorMessage } from '../lib/errors';

export type ActiveView = 'dashboard' | 'projects' | 'board' | 'tasks' | 'team' | 'profile' | 'settings' | 'notifications';

interface TaskFlowState {
  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Navigation
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  // Search & Global Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterOptions: TaskFilterOptions;
  setFilterOptions: (options: Partial<TaskFilterOptions>) => void;
  resetFilterOptions: () => void;

  // Modals & Popovers
  isNewTaskModalOpen: boolean;
  setNewTaskModalOpen: (open: boolean) => void;
  isNewProjectModalOpen: boolean;
  setNewProjectModalOpen: (open: boolean) => void;
  selectedTaskId: string | null;
  openTaskModal: (taskId: string) => void;
  closeTaskModal: () => void;
  isAuthModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;

  // Auth State
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: { name: string; email: string; password: string; role?: string; jobTitle?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<boolean>;

  // Users Directory
  allUsers: User[];
  fetchAllUsers: () => Promise<void>;

  // Projects State
  projects: Project[];
  activeProjectId: string | null;
  isLoadingProjects: boolean;
  fetchProjects: () => Promise<void>;
  selectProject: (id: string | null) => void;
  createProject: (data: CreateProjectInput) => Promise<Project | null>;
  updateProject: (id: string, data: Partial<Project>) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  addProjectMember: (projectId: string, userId: string) => Promise<boolean>;
  removeProjectMember: (projectId: string, userId: string) => Promise<boolean>;
  changeProjectMemberRole: (projectId: string, userId: string, role: 'admin' | 'member') => Promise<boolean>;
  transferProjectOwnership: (projectId: string, userId: string) => Promise<boolean>;

  // Tasks State
  tasks: Task[];
  isLoadingTasks: boolean;
  fetchTasks: (projectId?: string) => Promise<void>;
  createTask: (data: Partial<Task>) => Promise<Task | null>;
  updateTask: (id: string, data: Partial<Task>) => Promise<boolean>;
  moveTask: (id: string, newStatus: TaskStatus, newOrder?: number) => Promise<void>;
  deleteTask: (id: string) => Promise<boolean>;

  // Comments State
  comments: Comment[];
  isLoadingComments: boolean;
  fetchComments: (taskId: string) => Promise<void>;
  addComment: (taskId: string, content: string) => Promise<Comment | null>;
  deleteComment: (id: string) => Promise<boolean>;

  // Notifications State
  notifications: Notification[];
  unreadCount: number;
  isLoadingNotifications: boolean;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;

  // Dashboard Stats State
  dashboardStats: DashboardStats | null;
  isLoadingStats: boolean;
  fetchDashboardStats: () => Promise<void>;
}

export const useStore = create<TaskFlowState>((set, get) => ({
  // Theme setup
  theme:
    typeof window !== 'undefined' &&
    (localStorage.getItem('taskflow_theme') === 'dark' ||
      (!localStorage.getItem('taskflow_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches))
      ? 'dark'
      : 'light',
  toggleTheme: () => {
    const nextTheme = get().theme === 'light' ? 'dark' : 'light';
    set({ theme: nextTheme });
    try {
      localStorage.setItem('taskflow_theme', nextTheme);
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch {}
  },

  activeView: 'dashboard',
  setActiveView: (view) => set({ activeView: view }),

  searchQuery: '',
  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().setFilterOptions({ search: query });
  },

  filterOptions: {
    search: '',
    status: 'all',
    priority: 'all',
    assignedTo: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  setFilterOptions: (options) =>
    set((state) => ({ filterOptions: { ...state.filterOptions, ...options } })),
  resetFilterOptions: () =>
    set({
      filterOptions: {
        search: '',
        status: 'all',
        priority: 'all',
        assignedTo: 'all',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
      searchQuery: '',
    }),

  isNewTaskModalOpen: false,
  setNewTaskModalOpen: (open) => set({ isNewTaskModalOpen: open }),
  isNewProjectModalOpen: false,
  setNewProjectModalOpen: (open) => set({ isNewProjectModalOpen: open }),
  selectedTaskId: null,
  openTaskModal: (taskId) => set({ selectedTaskId: taskId }),
  closeTaskModal: () => set({ selectedTaskId: null }),
  isAuthModalOpen: false,
  setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),

  // Auth State
  currentUser: null,
  isAuthenticated: false,
  isLoadingAuth: true,

  checkAuth: async () => {
    try {
      const { data: session } = await authClient.getSession();
      if (!session?.user) throw new Error('No active session');
      const user = await api.get<User>('/api/auth/me');
      set({ currentUser: user, isAuthenticated: true, isLoadingAuth: false });
      get().fetchProjects();
      get().fetchAllUsers();
      get().fetchNotifications();
      get().fetchDashboardStats();
    } catch {
      set({ currentUser: null, isAuthenticated: false, isLoadingAuth: false });
    }
  },

  login: async (email, password) => {
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || 'Login failed');
      const user = await api.get<User>('/api/auth/me');
      set({ currentUser: user, isAuthenticated: true, isAuthModalOpen: false });
      toast.success(`Welcome back, ${user.name}`);
      get().fetchProjects();
      get().fetchAllUsers();
      get().fetchNotifications();
      get().fetchDashboardStats();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Login failed'));
      return false;
    }
  },

  register: async (data) => {
    try {
      const result = await authClient.signUp.email({ name: data.name, email: data.email, password: data.password });
      if (result.error) throw new Error(result.error.message || 'Registration failed');
      const user = await api.get<User>('/api/auth/me');
      set({ currentUser: user, isAuthenticated: true, isAuthModalOpen: false });
      toast.success(`Welcome to TaskFlow, ${user.name}!`);
      get().fetchProjects();
      get().fetchAllUsers();
      get().fetchNotifications();
      get().fetchDashboardStats();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Registration failed'));
      return false;
    }
  },

  logout: async () => {
    try { await authClient.signOut(); } catch {}
    set({
      currentUser: null,
      isAuthenticated: false,
      projects: [],
      tasks: [],
      activeProjectId: null,
      notifications: [],
      unreadCount: 0,
      activeView: 'dashboard',
    });
    toast.success('Signed out successfully');
  },

  updateProfile: async (data) => {
    try {
      const updated = await api.patch<User>('/api/auth/profile', data);
      set({ currentUser: updated });
      toast.success('Profile updated');
      get().fetchAllUsers();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not update profile'));
      return false;
    }
  },

  // Users Directory
  allUsers: [],
  fetchAllUsers: async () => {
    try {
      const users = await api.get<User[]>('/api/auth/users');
      set({ allUsers: users });
    } catch {}
  },

  // Projects State
  projects: [],
  activeProjectId: null,
  isLoadingProjects: false,

  fetchProjects: async () => {
    set({ isLoadingProjects: true });
    try {
      const projects = await api.get<Project[]>('/api/projects');
      set({
        projects,
        isLoadingProjects: false,
        activeProjectId: get().activeProjectId || (projects.length > 0 ? projects[0].id : null),
      });
      // Also fetch tasks for active project
      const currentActive = get().activeProjectId || (projects.length > 0 ? projects[0].id : null);
      if (currentActive) {
        get().fetchTasks(currentActive);
      }
    } catch (err: unknown) {
      set({ isLoadingProjects: false });
    }
  },

  selectProject: (id) => {
    set({ activeProjectId: id });
    if (id) {
      get().fetchTasks(id);
    } else {
      get().fetchTasks();
    }
  },

  createProject: async (data) => {
    try {
      const created = await api.post<Project>('/api/projects', data);
      set((state) => ({
        projects: [created, ...state.projects],
        activeProjectId: created.id,
      }));
      toast.success(`Project "${created.name}" created`);
      get().fetchTasks(created.id);
      get().fetchDashboardStats();
      return created;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not create project'));
      return null;
    }
  },

  updateProject: async (id, data) => {
    try {
      const updated = await api.patch<Project>(`/api/projects/${id}`, data);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
      }));
      toast.success('Project details saved');
      get().fetchDashboardStats();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not update project'));
      return false;
    }
  },

  deleteProject: async (id) => {
    try {
      await api.delete(`/api/projects/${id}`);
      set((state) => {
        const remaining = state.projects.filter((p) => p.id !== id);
        return {
          projects: remaining,
          activeProjectId: remaining.length > 0 ? remaining[0].id : null,
          tasks: state.tasks.filter((t) => t.projectId !== id),
        };
      });
      toast.success('Project deleted');
      get().fetchDashboardStats();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not delete project'));
      return false;
    }
  },

  addProjectMember: async (projectId, userId) => {
    try {
      const updated = await api.post<Project>(`/api/projects/${projectId}/members`, { userId });
      set((state) => ({
        projects: state.projects.map((p) => (p.id === projectId ? updated : p)),
      }));
      toast.success('Team member added to project');
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not add team member'));
      return false;
    }
  },

  removeProjectMember: async (projectId, userId) => {
    try {
      const updated = await api.delete<Project>(`/api/projects/${projectId}/members/${userId}`);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === projectId ? updated : p)),
      }));
      toast.success('Team member removed');
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not remove member'));
      return false;
    }
  },

  changeProjectMemberRole: async (projectId, userId, role) => {
    try {
      const updated = await api.patch<Project>(`/api/projects/${projectId}/members/${userId}/role`, { role });
      set((state) => ({ projects: state.projects.map((project) => project.id === projectId ? updated : project) }));
      toast.success('Project member role updated');
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not change member role'));
      return false;
    }
  },

  transferProjectOwnership: async (projectId, userId) => {
    try {
      const updated = await api.post<Project>(`/api/projects/${projectId}/transfer-ownership`, { userId });
      set((state) => ({ projects: state.projects.map((project) => project.id === projectId ? updated : project) }));
      toast.success('Project ownership transferred');
      get().fetchDashboardStats();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not transfer project ownership'));
      return false;
    }
  },

  // Tasks State
  tasks: [],
  isLoadingTasks: false,

  fetchTasks: async (projectId) => {
    set({ isLoadingTasks: true });
    try {
      const url = projectId ? `/api/tasks?projectId=${projectId}` : '/api/tasks';
      const tasks = await api.get<Task[]>(url);
      set({ tasks, isLoadingTasks: false });
    } catch {
      set({ isLoadingTasks: false });
    }
  },

  createTask: async (data) => {
    try {
      const created = await api.post<Task>('/api/tasks', data);
      set((state) => ({ tasks: [...state.tasks, created] }));
      toast.success(`Task "${created.title}" created`);
      get().fetchDashboardStats();
      return created;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not create task'));
      return null;
    }
  },

  updateTask: async (id, data) => {
    try {
      const updated = await api.patch<Task>(`/api/tasks/${id}`, data);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
      }));
      toast.success('Task updated');
      get().fetchDashboardStats();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not update task'));
      return false;
    }
  },

  moveTask: async (id, newStatus, newOrder = 0) => {
    // Optimistic UI update
    const previousTasks = get().tasks;
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status: newStatus, order: newOrder } : t
      ),
    }));

    try {
      await api.patch(`/api/tasks/${id}`, { status: newStatus, order: newOrder });
      toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
      get().fetchDashboardStats();
    } catch (err: unknown) {
      // Revert on failure
      set({ tasks: previousTasks });
      toast.error(errorMessage(err, 'Failed to update task position'));
    }
  },

  deleteTask: async (id) => {
    try {
      await api.delete(`/api/tasks/${id}`);
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }));
      toast.success('Task deleted');
      get().fetchDashboardStats();
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not delete task'));
      return false;
    }
  },

  // Comments State
  comments: [],
  isLoadingComments: false,

  fetchComments: async (taskId) => {
    set({ isLoadingComments: true });
    try {
      const comments = await api.get<Comment[]>(`/api/comments/task/${taskId}`);
      set({ comments, isLoadingComments: false });
    } catch {
      set({ isLoadingComments: false });
    }
  },

  addComment: async (taskId, content) => {
    try {
      const newComment = await api.post<Comment>(`/api/comments/task/${taskId}`, { content });
      set((state) => ({ comments: [...state.comments, newComment] }));
      toast.success('Comment posted');
      return newComment;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not post comment'));
      return null;
    }
  },

  deleteComment: async (id) => {
    try {
      await api.delete(`/api/comments/${id}`);
      set((state) => ({ comments: state.comments.filter((c) => c.id !== id) }));
      toast.success('Comment deleted');
      return true;
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not delete comment'));
      return false;
    }
  },

  // Notifications State
  notifications: [],
  unreadCount: 0,
  isLoadingNotifications: false,

  fetchNotifications: async () => {
    set({ isLoadingNotifications: true });
    try {
      const notifs = await api.get<Notification[]>('/api/notifications');
      set({
        notifications: notifs,
        unreadCount: countUnreadNotifications(notifs),
        isLoadingNotifications: false,
      });
    } catch {
      set({ isLoadingNotifications: false });
    }
  },

  markNotificationRead: async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      set((state) => {
        const updated = state.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n));
        return {
          notifications: updated,
          unreadCount: countUnreadNotifications(updated),
        };
      });
    } catch {}
  },

  markAllNotificationsRead: async () => {
    try {
      await api.patch('/api/notifications/read-all');
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
      toast.success('All marked as read');
    } catch {}
  },

  // Dashboard Stats State
  dashboardStats: null,
  isLoadingStats: false,

  fetchDashboardStats: async () => {
    set({ isLoadingStats: true });
    try {
      const stats = await api.get<DashboardStats>('/api/dashboard/stats');
      set({ dashboardStats: stats, isLoadingStats: false });
    } catch {
      set({ isLoadingStats: false });
    }
  },
}));
