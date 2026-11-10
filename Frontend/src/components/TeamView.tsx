import React, { useState } from 'react';
import { Mail, Briefcase, Plus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar } from './Avatar';
import toast from 'react-hot-toast';

export const TeamView: React.FC = () => {
  const { allUsers, tasks, projects, currentUser, activeProjectId, addProjectMember } = useStore();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const project = projects.find((item) => item.id === activeProjectId);
    const member = allUsers.find((item) => item.email.toLowerCase() === inviteEmail.trim().toLowerCase());
    if (!project || !member) {
      toast.error(!project ? 'Select a project before adding a member.' : 'No registered user has that email.');
      return;
    }
    const success = await addProjectMember(project.id, member.id);
    if (success) {
      setIsInviteModalOpen(false);
      setInviteEmail('');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Team Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Team members, roles, permissions, and workload assignments.
          </p>
        </div>

        {(currentUser?.role === 'admin' || projects.some((p) => p.id === activeProjectId && p.ownerId === currentUser?.id)) && activeProjectId && (
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white rounded-lg shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {allUsers.map((member) => {
          const assignedTasks = tasks.filter((t) => t.assignedTo === member.id);
          const completedTasks = assignedTasks.filter((t) => t.status === 'completed').length;
          return (
            <div
              key={member.id}
              className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <Avatar name={member.name} avatar={member.avatar} size="lg" />
                  <span className="text-[10px] px-2 py-0.5 rounded border uppercase font-mono font-semibold bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                    {member.role.replace('_', ' ')}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  {member.name}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>{member.jobTitle || 'Team Member'}</span>
                  <span>·</span>
                  <span>{member.department || 'Operations'}</span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono text-[11px] truncate">{member.email}</span>
                </div>
              </div>

              {/* Workload Stats */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 block">Assigned Tasks</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                    {assignedTasks.length}
                  </span>
                </div>

                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 block">Completed</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {completedTasks}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Member Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Add New Team Member
            </h3>

            <form onSubmit={handleInviteSubmit} className="space-y-3.5 text-xs">
              <p className="text-slate-500">Add an existing registered user to the selected project.</p>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Member email *
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
                >
                  Add to Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
