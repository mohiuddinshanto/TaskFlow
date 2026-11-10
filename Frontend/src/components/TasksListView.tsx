import React, { useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  Calendar,
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Circle,
  Eye,
  Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Task, TaskPriority, TaskStatus } from '../types/index';
import { Avatar } from './Avatar';
import { isTaskOverdue, filterAndSortTasks } from '../utils/taskCalculations';

export const TasksListView: React.FC = () => {
  const {
    tasks,
    projects,
    allUsers,
    openTaskModal,
    setNewTaskModalOpen,
    deleteTask,
    moveTask,
  } = useStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'dueDate' | 'priority' | 'title'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredTasks = filterAndSortTasks(tasks, {
    search,
    status: statusFilter as any,
    priority: priorityFilter as any,
    projectId: projectFilter === 'all' ? undefined : projectFilter,
    assignedTo: assignedFilter as any,
    sortBy,
    sortOrder,
  });

  const getUser = (userId?: string) => allUsers.find((u) => u.id === userId);
  const getProject = (projId: string) => projects.find((p) => p.id === projId);

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent':
        return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900';
      case 'high':
        return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900';
      case 'medium':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900';
      case 'low':
        return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'review':
        return <Eye className="w-3.5 h-3.5 text-purple-500" />;
      case 'in_progress':
        return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      case 'todo':
        return <Circle className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const toggleSort = (field: 'createdAt' | 'dueDate' | 'priority' | 'title') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Workspace Tasks
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Search, filter, and sort tasks across all projects in table view.
          </p>
        </div>

        <button
          onClick={() => setNewTaskModalOpen(true)}
          className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white rounded-lg shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Task</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by title, description, or label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Project Filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="review">In Review</option>
            <option value="completed">Completed</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
          >
            <option value="all">All Assignees</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th
                  onClick={() => toggleSort('title')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Task Title</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4">Status</th>
                <th
                  onClick={() => toggleSort('priority')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Priority</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Assignee</th>
                <th
                  onClick={() => toggleSort('dueDate')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Due Date</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                    No tasks matching your current filters.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const assignee = getUser(task.assignedTo);
                  const project = getProject(task.projectId);
                  const isOverdue = isTaskOverdue(task);

                  return (
                    <tr
                      key={task.id}
                      onClick={() => openTaskModal(task.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Task Title */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {task.title}
                        </div>
                        {task.labels && task.labels.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {task.labels.slice(0, 2).map((l) => (
                              <span
                                key={l}
                                className="text-[10px] text-slate-500 font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800"
                              >
                                #{l}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Project */}
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                        {project?.name || 'General'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(task.status)}
                          <select
                            value={task.status}
                            onChange={(e) => moveTask(task.id, e.target.value as TaskStatus)}
                            className="text-xs capitalize bg-transparent border-0 font-medium text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0 p-0"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="review">In Review</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border uppercase font-mono font-medium ${getPriorityBadge(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                      </td>

                      {/* Assignee */}
                      <td className="py-3 px-4">
                        {assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={assignee.name} avatar={assignee.avatar} size="xs" />
                            <span className="text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                              {assignee.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Due Date */}
                      <td className="py-3 px-4">
                        {task.dueDate ? (
                          <span
                            className={`tabular-nums font-medium ${
                              isOverdue
                                ? 'text-rose-600 dark:text-rose-400 font-bold'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {new Date(task.dueDate).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => deleteTask(task.id)}
                          title="Delete task"
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
