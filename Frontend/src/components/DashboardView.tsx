import React, { useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FolderKanban,
  CheckSquare,
  TrendingUp,
  ArrowRight,
  Calendar,
  Plus,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar } from './Avatar';
import { calculateProjectProgress, isTaskOverdue } from '../utils/taskCalculations';

export const DashboardView: React.FC = () => {
  const {
    currentUser,
    dashboardStats,
    fetchDashboardStats,
    setActiveView,
    selectProject,
    setNewTaskModalOpen,
    setNewProjectModalOpen,
    projects,
    tasks,
    openTaskModal,
    allUsers,
  } = useStore();

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const stats = dashboardStats || {
    totalProjects: projects.length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === 'completed').length,
    pendingTasks: tasks.filter((t) => t.status === 'todo').length,
    inProgressTasks: tasks.filter((t) => t.status === 'in_progress').length,
    reviewTasks: tasks.filter((t) => t.status === 'review').length,
    overdueTasks: tasks.filter((task) => isTaskOverdue(task)).length,
    completionRate: tasks.length ? Math.round((tasks.filter((task) => task.status === 'completed').length / tasks.length) * 100) : 0,
    recentProjects: projects.slice(0, 3),
    recentActivities: [],
    upcomingDeadlines: tasks.filter((t) => t.dueDate && t.status !== 'completed').slice(0, 4),
    statusDistribution: [],
    priorityDistribution: [],
  };

  const getUserName = (userId?: string) => {
    if (!userId) return 'Unassigned';
    const found = allUsers.find((u) => u.id === userId);
    return found ? found.name : 'Team Member';
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900';
      case 'high':
        return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900';
      case 'medium':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900';
      default:
        return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Welcome & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {currentUser?.name || 'Explorer'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Here is the current status of your projects, tasks, and deadlines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewProjectModalOpen(true)}
            className="py-2 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>
          <button
            onClick={() => setNewTaskModalOpen(true)}
            className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Strip (Tabular Figures) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Projects */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Projects</span>
            <FolderKanban className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {stats.totalProjects}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Active workspaces</span>
        </div>

        {/* Total Tasks */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Total Tasks</span>
            <CheckSquare className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {stats.totalTasks}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Across all columns</span>
        </div>

        {/* In Progress */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">In Progress</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2 tabular-nums">
            {stats.inProgressTasks}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Actively being worked</span>
        </div>

        {/* Completed Tasks */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
            {stats.completedTasks}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Closed &amp; resolved</span>
        </div>

        {/* Overdue Tasks */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 md:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Overdue</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2 tabular-nums">
            {stats.overdueTasks}
          </div>
          <span className="text-[11px] text-rose-500/80 mt-1 block font-medium">
            Requires immediate attention
          </span>
        </div>
      </div>

      {/* Progress & Distribution Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Completion Rate Card */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Task Completion Rate
              </span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Overall velocity across all registered tasks.
            </p>
          </div>

          <div className="my-6">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {stats.completionRate}%
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {stats.completedTasks} of {stats.totalTasks} tasks done
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                {stats.pendingTasks}
              </div>
              <div className="text-[10px] text-slate-400">To Do</div>
            </div>
            <div>
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {stats.inProgressTasks}
              </div>
              <div className="text-[10px] text-slate-400">In Progress</div>
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {stats.completedTasks}
              </div>
              <div className="text-[10px] text-slate-400">Completed</div>
            </div>
          </div>
        </div>

        {/* Priority Breakdown Card */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Task Status &amp; Priority Breakdown
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Distribution of workload across four priority tiers.
              </p>
            </div>
            <button
              onClick={() => setActiveView('tasks')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Urgent',
                count: tasks.filter((t) => t.priority === 'urgent').length,
                color: 'bg-rose-500',
                border: 'border-rose-200 dark:border-rose-900',
              },
              {
                label: 'High',
                count: tasks.filter((t) => t.priority === 'high').length,
                color: 'bg-amber-500',
                border: 'border-amber-200 dark:border-amber-900',
              },
              {
                label: 'Medium',
                count: tasks.filter((t) => t.priority === 'medium').length,
                color: 'bg-blue-500',
                border: 'border-blue-200 dark:border-blue-900',
              },
              {
                label: 'Low',
                count: tasks.filter((t) => t.priority === 'low').length,
                color: 'bg-slate-400',
                border: 'border-slate-200 dark:border-slate-800',
              },
            ].map((p) => (
              <div
                key={p.label}
                className={`p-3 rounded-lg border ${p.border} bg-slate-50/50 dark:bg-slate-800/40`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${p.color}`} />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {p.label}
                  </span>
                </div>
                <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {p.count}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Kanban Column summary */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">
              Columns Summary
            </span>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-800">
                <span className="text-slate-500 block text-[10px]">Todo</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                  {stats.pendingTasks}
                </span>
              </div>
              <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30">
                <span className="text-amber-600 block text-[10px]">In Progress</span>
                <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {stats.inProgressTasks}
                </span>
              </div>
              <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/30">
                <span className="text-purple-600 block text-[10px]">Review</span>
                <span className="font-bold text-purple-700 dark:text-purple-300 tabular-nums">
                  {stats.reviewTasks}
                </span>
              </div>
              <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/30">
                <span className="text-emerald-600 block text-[10px]">Completed</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {stats.completedTasks}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Projects & Deadlines 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Active Projects
              </h2>
            </div>
            <button
              onClick={() => setActiveView('projects')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>All Projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {projects.slice(0, 3).map((proj) => {
              const projectTasks = tasks.filter((t) => t.projectId === proj.id);
              const progress = calculateProjectProgress(projectTasks);
              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    selectProject(proj.id);
                    setActiveView('board');
                  }}
                  className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors truncate">
                      {proj.name}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums shrink-0 ml-2">
                      {progress}%
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                    {proj.description || 'No description provided.'}
                  </p>

                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2.5">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Due {new Date(proj.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <div className="flex -space-x-1.5">
                      {proj.members.slice(0, 3).map((m) => {
                        const u = allUsers.find((user) => user.id === m.userId);
                        return <Avatar key={m.userId} name={u?.name || 'M'} avatar={u?.avatar} size="xs" />;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Upcoming Deadlines
              </h2>
            </div>
            <button
              onClick={() => setActiveView('tasks')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>View Tasks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {stats.upcomingDeadlines.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No upcoming deadlines in the next 14 days.
              </div>
            ) : (
              stats.upcomingDeadlines.map((task) => {
                const isOverdue = new Date(task.dueDate!).getTime() < Date.now();
                return (
                  <div
                    key={task.id}
                    onClick={() => openTaskModal(task.id)}
                    className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-mono font-medium ${getPriorityStyle(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {task.title}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                        <span>Assigned to: {getUserName(task.assignedTo)}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {isOverdue ? 'Overdue' : 'Due'}{' '}
                        {new Date(task.dueDate!).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
