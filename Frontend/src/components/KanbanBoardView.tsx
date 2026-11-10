import React, { useState } from 'react';
import {
  Plus,
  Calendar,
  MessageSquare,
  AlertCircle,
  Filter,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Circle,
  Eye,
  GripVertical,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Task, TaskPriority, TaskStatus } from '../types/index';
import { Avatar } from './Avatar';
import { groupTasksByStatus, isTaskOverdue } from '../utils/taskCalculations';

const COLUMNS: { id: TaskStatus; label: string; icon: React.FC<any>; color: string; border: string }[] = [
  { id: 'todo', label: 'To Do', icon: Circle, color: 'text-slate-500', border: 'border-slate-300 dark:border-slate-700' },
  { id: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-amber-500', border: 'border-amber-300 dark:border-amber-800' },
  { id: 'review', label: 'In Review', icon: Eye, color: 'text-purple-500', border: 'border-purple-300 dark:border-purple-800' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-emerald-500', border: 'border-emerald-300 dark:border-emerald-800' },
];

export const KanbanBoardView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectProject,
    tasks,
    moveTask,
    openTaskModal,
    setNewTaskModalOpen,
    allUsers,
  } = useStore();

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  // Filter tasks for active project
  let projectTasks = tasks.filter((t) => t.projectId === (activeProject?.id || ''));

  // Apply board filters
  if (boardSearch.trim().length > 0) {
    const q = boardSearch.toLowerCase().trim();
    projectTasks = projectTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.labels.some((l) => l.toLowerCase().includes(q))
    );
  }
  if (priorityFilter !== 'all') {
    projectTasks = projectTasks.filter((t) => t.priority === priorityFilter);
  }
  if (assigneeFilter !== 'all') {
    projectTasks = projectTasks.filter((t) => t.assignedTo === assigneeFilter);
  }

  const groupedTasks = groupTasksByStatus(projectTasks);

  const getUser = (userId?: string) => allUsers.find((u) => u.id === userId);

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

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent, status: TaskStatus) => {
    // Check if moving out of current column container
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverColumn === status) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== targetStatus) {
      const targetColumnLength = groupedTasks[targetStatus].length;
      moveTask(taskId, targetStatus, targetColumnLength);
    }
    setDraggedTaskId(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Board Top Header */}
      <div className="p-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {activeProject?.name || 'Project Kanban Board'}
              </h1>
              {activeProject?.category && (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
                  · {activeProject.category}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
              {activeProject?.description || 'Manage tasks, drag items between columns, and track progress.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Team Members Stacks */}
            <div className="flex -space-x-1.5 items-center mr-2">
              {activeProject?.members.map((m) => {
                const u = getUser(m.userId);
                return <Avatar key={m.userId} name={u?.name || 'M'} avatar={u?.avatar} size="xs" />;
              })}
            </div>

            <button
              onClick={() => setNewTaskModalOpen(true)}
              className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </div>
        </div>

        {/* Toolbar Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search within board */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter board..."
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-36 sm:w-48"
              />
            </div>

            {/* Priority filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md">
              {['all', 'urgent', 'high', 'medium', 'low'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                    priorityFilter === p
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Showing {projectTasks.length} tasks
          </div>
        </div>
      </div>

      {/* 4 Kanban Columns Container */}
      <div className="flex-1 overflow-x-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-w-[760px] h-full items-start">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const columnTasks = groupedTasks[col.id] || [];
            const isTarget = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={(e) => handleDragLeave(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`flex flex-col max-h-full rounded-xl border transition-colors ${
                  isTarget
                    ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-400/20'
                    : 'bg-slate-100/60 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800'
                }`}
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${col.color}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {col.label}
                    </span>
                    <span className="text-[11px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 tabular-nums">
                      {columnTasks.length}
                    </span>
                  </div>

                  <button
                    onClick={() => setNewTaskModalOpen(true)}
                    title={`Add task to ${col.label}`}
                    aria-label={`Add task to ${col.label}`}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Cards List */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[140px]">
                  {columnTasks.length === 0 ? (
                    <div className="h-28 border border-dashed border-slate-300 dark:border-slate-800 rounded-lg flex items-center justify-center text-[11px] text-slate-400">
                      Drop tasks here
                    </div>
                  ) : (
                    columnTasks.map((task) => {
                      const assignee = getUser(task.assignedTo);
                      const isOverdue = isTaskOverdue(task);
                      const isBeingDragged = draggedTaskId === task.id;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => openTaskModal(task.id)}
                          className={`p-3 bg-white dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-xs hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-grab active:cursor-grabbing group ${
                            isBeingDragged ? 'opacity-40 scale-95' : 'opacity-100'
                          }`}
                        >
                          {/* Priority & Grip Bar */}
                          <div className="flex items-center justify-between gap-1 mb-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-mono font-medium ${getPriorityBadge(
                                task.priority
                              )}`}
                            >
                              {task.priority}
                            </span>

                            <GripVertical className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>

                          {/* Title */}
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug mb-1.5">
                            {task.title}
                          </h4>

                          {/* Description snippet */}
                          {task.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2.5 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {/* Labels */}
                          {task.labels && task.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                              {task.labels.map((l) => (
                                <span
                                  key={l}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono"
                                >
                                  #{l}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Card Footer: Due Date & Assignee */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400">
                            <div className="flex items-center gap-2">
                              {task.dueDate && (
                                <span
                                  className={`flex items-center gap-1 font-medium ${
                                    isOverdue
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {isOverdue && <AlertCircle className="w-3 h-3" />}
                                  <Calendar className="w-3 h-3" />
                                  <span className="tabular-nums">
                                    {new Date(task.dueDate).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {assignee && (
                                <Avatar
                                  name={assignee.name}
                                  avatar={assignee.avatar}
                                  size="xs"
                                />
                              )}
                            </div>
                          </div>

                          {/* Mobile quick-move select */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between md:hidden"
                          >
                            <span className="text-[10px] text-slate-400">Move:</span>
                            <select
                              value={task.status}
                              onChange={(e) => moveTask(task.id, e.target.value as TaskStatus)}
                              className="text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5"
                            >
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="review">In Review</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Quick Add Card at column bottom */}
                <div className="p-2 border-t border-slate-200/60 dark:border-slate-800/80 shrink-0">
                  <button
                    onClick={() => setNewTaskModalOpen(true)}
                    className="w-full py-1.5 px-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 rounded flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Task</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
