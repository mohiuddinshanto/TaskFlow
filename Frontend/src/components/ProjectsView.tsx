import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Calendar,
  Users,
  Search,
  Trash2,
  Edit2,
  ArrowRight,
  Clock,
  Layers,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar } from './Avatar';
import { calculateProjectProgress } from '../utils/taskCalculations';
import { Project } from '../types';

export const ProjectsView: React.FC = () => {
  const {
    projects,
    tasks,
    selectProject,
    setActiveView,
    setNewProjectModalOpen,
    deleteProject,
    updateProject,
    currentUser,
    allUsers,
  } = useStore();

  const [search, setSearch] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase())) ||
      (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
  );

  const getUser = (userId: string) => allUsers.find((u) => u.id === userId);

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    await deleteProject(projectToDelete);
    setProjectToDelete(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Projects
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage your workspaces, track deliverables, and invite team members.
          </p>
        </div>

        <button
          onClick={() => setNewProjectModalOpen(true)}
          className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white rounded-lg shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
        </span>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProjects.map((proj) => {
          const projectTasks = tasks.filter((t) => t.projectId === proj.id);
          const progress = calculateProjectProgress(projectTasks);
          const completedCount = projectTasks.filter((t) => t.status === 'completed').length;
          const owner = getUser(proj.ownerId);
          const canManage = currentUser?.role === 'admin' || proj.ownerId === currentUser?.id;

          return (
            <div
              key={proj.id}
              className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
            >
              <div>
                {/* Header: Category & Actions */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider font-mono">
                    {proj.category || 'General'}
                  </span>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    {canManage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setProjectToEdit(proj); }}
                        title="Edit project"
                        aria-label={`Edit ${proj.name}`}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(proj.id);
                        }}
                        title="Delete project"
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {canManage && (
                  <label className="sr-only" htmlFor={`project-status-${proj.id}`}>Status for {proj.name}</label>
                )}
                <select
                  id={`project-status-${proj.id}`}
                  aria-label={`Status for ${proj.name}`}
                  disabled={!canManage}
                  value={proj.status || 'active'}
                  onChange={(e) => updateProject(proj.id, { status: e.target.value as Project['status'] })}
                  className="mb-2 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 disabled:opacity-75"
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="completed">Completed</option>
                </select>

                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5 leading-snug">
                  {proj.name}
                </h3>

                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                  {proj.description || 'No description provided.'}
                </p>
              </div>

              <div>
                {/* Progress Bar & Stats */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Progress</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                      {progress}% ({completedCount}/{projectTasks.length} tasks)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Dates & Members */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      Due {new Date(proj.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  {/* Team Members */}
                  <div className="flex -space-x-1.5">
                    {proj.members.map((m) => {
                      const u = getUser(m.userId);
                      return <Avatar key={m.userId} name={u?.name || 'M'} avatar={u?.avatar} size="xs" />;
                    })}
                  </div>
                </div>

                {/* Primary CTA */}
                <button
                  onClick={() => {
                    selectProject(proj.id);
                    setActiveView('board');
                  }}
                  className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 border border-slate-200 dark:border-slate-700 hover:border-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Open Kanban Board</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-5 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Delete Project?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Are you sure you want to delete this project? All associated tasks, comments, and activities will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
      {projectToEdit && (
        <ProjectEditModal
          key={projectToEdit.id}
          project={projectToEdit}
          onClose={() => setProjectToEdit(null)}
          onSave={async (data) => {
            const saved = await updateProject(projectToEdit.id, data);
            if (saved) setProjectToEdit(null);
          }}
        />
      )}
    </div>
  );
};

function ProjectEditModal({ project, onClose, onSave }: {
  project: Project;
  onClose: () => void;
  onSave: (data: Partial<Project>) => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [startDate, setStartDate] = useState(project.startDate.slice(0, 10));
  const [dueDate, setDueDate] = useState(project.dueDate.slice(0, 10));
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !startDate || !dueDate || dueDate < startDate) return;
    setSaving(true);
    await onSave({ name: name.trim(), description, startDate: new Date(startDate).toISOString(), dueDate: new Date(dueDate).toISOString() });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-bold">Edit project</h2>
        <label className="block text-sm">Project name<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border p-2 dark:bg-slate-800" /></label>
        <label className="block text-sm">Description<textarea maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded border p-2 dark:bg-slate-800" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Start date<input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded border p-2 dark:bg-slate-800" /></label>
          <label className="block text-sm">Due date<input type="date" required min={startDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded border p-2 dark:bg-slate-800" /></label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-2">Cancel</button>
          <button type="submit" disabled={saving || !name.trim() || dueDate < startDate} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  );
}
