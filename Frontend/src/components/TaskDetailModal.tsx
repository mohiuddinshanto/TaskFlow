import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Save,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { TaskPriority, TaskStatus } from '../types/index';
import { Avatar } from './Avatar';
import toast from 'react-hot-toast';

export const TaskDetailModal: React.FC = () => {
  const {
    selectedTaskId,
    closeTaskModal,
    tasks,
    updateTask,
    deleteTask,
    projects,
    allUsers,
    currentUser,
    comments,
    fetchComments,
    addComment,
    deleteComment,
  } = useStore();

  const task = tasks.find((t) => t.id === selectedTaskId);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [estimatedHours, setEstimatedHours] = useState<number | ''>('');
  const [actualHours, setActualHours] = useState<number | ''>('');
  const [isSaving, setIsSaving] = useState(false);

  // New comment input
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Populate when selected task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setPriority(task.priority);
      setAssignedTo(task.assignedTo || '');
      setDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
      setLabels(task.labels || []);
      setEstimatedHours(task.estimatedHours ?? '');
      setActualHours(task.actualHours ?? '');
      fetchComments(task.id);
    }
  }, [task, fetchComments]);

  if (!task) return null;

  const project = projects.find((p) => p.id === task.projectId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }
    setIsSaving(true);
    await updateTask(task.id, {
      title: title.trim(),
      description,
      status,
      priority,
      assignedTo: assignedTo || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      labels,
      estimatedHours: estimatedHours === '' ? undefined : Number(estimatedHours),
      actualHours: actualHours === '' ? undefined : Number(actualHours),
    });
    setIsSaving(false);
  };

  const handleAddLabel = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && labelInput.trim()) {
      e.preventDefault();
      const clean = labelInput.trim().toLowerCase().replace('#', '');
      if (!labels.includes(clean)) {
        setLabels([...labels, clean]);
      }
      setLabelInput('');
    }
  };

  const handleRemoveLabel = (labelToRemove: string) => {
    setLabels(labels.filter((l) => l !== labelToRemove));
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setIsSubmittingComment(true);
    await addComment(task.id, commentText);
    setCommentText('');
    setIsSubmittingComment(false);
  };

  const handleDeleteTask = async () => {
    if (window.confirm(`Delete task "${task.title}"?`)) {
      await deleteTask(task.id);
      closeTaskModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {project?.name || 'Project'}
            </span>
            <span>·</span>
            <span>Task #{task.id.slice(-6)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDeleteTask}
              title="Delete task"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={closeTaskModal}
              title="Close modal"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <form id="task-edit-form" onSubmit={handleSave} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Task Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-base font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Properties Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {/* Status */}
              <div>
                <label className="block font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-medium capitalize focus:outline-hidden"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">In Review</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-medium capitalize focus:outline-hidden"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Assignee */}
              <div>
                <label className="block font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Assignee
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-medium focus:outline-hidden"
                >
                  <option value="">Unassigned</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due Date */}
              <div>
                <label className="block font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-medium focus:outline-hidden"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more details, requirements, links, or notes..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Labels Tag Manager */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Labels (type &amp; press Enter)
              </label>
              <div className="flex flex-wrap gap-1.5 items-center p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg min-h-[38px]">
                {labels.map((lbl) => (
                  <span
                    key={lbl}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs font-mono"
                  >
                    #{lbl}
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(lbl)}
                      className="hover:text-blue-900"
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={labels.length === 0 ? 'e.g. backend, ui...' : 'Add label...'}
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={handleAddLabel}
                  className="bg-transparent border-0 text-xs p-1 focus:outline-hidden text-slate-900 dark:text-slate-100 flex-1 min-w-[100px]"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Task Changes'}</span>
              </button>
            </div>
          </form>

          {/* Comments / Collaboration Section */}
          <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Comments &amp; Collaboration ({comments.length})
              </h3>
            </div>

            {/* New Comment Input */}
            <form onSubmit={handleCommentSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Write a comment or update for the team..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isSubmittingComment || !commentText.trim()}
                className="px-3.5 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Post</span>
              </button>
            </form>

            {/* Comments List */}
            <div className="space-y-3 pt-2">
              {comments.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">
                  No comments yet. Start the conversation!
                </div>
              ) : (
                comments.map((c) => {
                  const commentAuthor = allUsers.find((u) => u.id === c.authorId);
                  const canDelete =
                    currentUser?.role === 'admin' || currentUser?.id === c.authorId;

                  return (
                    <div
                      key={c.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={commentAuthor?.name || 'User'}
                            avatar={commentAuthor?.avatar}
                            size="xs"
                          />
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {commentAuthor?.name || 'Team Member'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(c.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {canDelete && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            title="Delete comment"
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed pl-6">
                        {c.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
