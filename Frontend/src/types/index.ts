export type UserRole = 'admin' | 'project_owner' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  jobTitle?: string;
  department?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProjectMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

export type ProjectStatus = 'active' | 'on_hold' | 'completed';

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: ProjectMember[];
  status?: ProjectStatus;
  startDate: string;
  dueDate: string;
  color?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateProjectInput = Pick<Project, 'name'> &
  Partial<Pick<Project, 'description' | 'startDate' | 'dueDate' | 'color' | 'category'>> &
  { memberIds?: string[] };

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string; // userId
  createdBy: string; // userId
  labels: string[];
  startDate?: string;
  dueDate?: string;
  order: number;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'task_assigned'
  | 'project_invited'
  | 'deadline_approaching'
  | 'comment_added'
  | 'status_changed'
  | 'project_role_changed'
  | 'ownership_transferred';

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  message: string;
  relatedProjectId?: string;
  relatedTaskId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Activity {
  id: string;
  userId: string;
  projectId?: string;
  taskId?: string;
  targetId?: string;
  targetType?: 'member' | 'project' | 'task';
  action: string;
  details: string;
  createdAt: string;
}

export interface DashboardStats {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  reviewTasks: number;
  overdueTasks: number;
  completionRate: number;
  recentProjects: Project[];
  recentActivities: Activity[];
  upcomingDeadlines: Task[];
  statusDistribution: { status: TaskStatus; count: number }[];
  priorityDistribution: { priority: TaskPriority; count: number }[];
}

export interface DatabaseStatus {
  isMongoConnected: boolean;
  mode: string;
  counts: {
    users: number;
    projects: number;
    tasks: number;
    comments: number;
    notifications: number;
    activities: number;
  };
}

export interface TaskFilterOptions {
  search?: string;
  projectId?: string;
  status?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  assignedTo?: string | 'all';
  dueDateFilter?: TaskDueDateFilter;
  dueDateFrom?: string;
  dueDateTo?: string;
  sortBy?: 'dueDate' | 'priority' | 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export type TaskDueDateFilter = 'overdue' | 'today' | 'this_week' | 'none' | 'custom';
