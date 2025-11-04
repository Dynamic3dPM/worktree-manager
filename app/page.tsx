'use client';

import { useState, useEffect } from 'react';

interface Repo {
  key: string;
  name: string;
  url: string;
  exists: boolean;
  path: string;
}

interface Worktree {
  repo: string;
  repoName: string;
  type: string;
  name: string;
  branch: string;
  path: string;
  fullPath: string;
}

const REPO_DISPLAY_NAMES: Record<string, string> = {
  frontend: 'Frontend',
  viewer: 'OHIF Viewer',
  backend: 'Backend'
};

const TYPE_DISPLAY_NAMES: Record<string, string> = {
  feat: 'New Feature',
  bugs: 'Bug Fix',
  fixes: 'Fix'
};

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [branchName, setBranchName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reposRes, worktreesRes] = await Promise.all([
        fetch('/api/repos'),
        fetch('/api/worktrees')
      ]);
      
      const reposData = await reposRes.json();
      const worktreesData = await worktreesRes.json();
      
      setRepos(reposData.repos || []);
      setWorktrees(worktreesData.worktrees || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedRepo || !selectedType || !branchName.trim()) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    // Validate branch name
    if (!/^[a-zA-Z0-9_-]+$/.test(branchName)) {
      setMessage({ type: 'error', text: 'Branch name can only contain letters, numbers, hyphens, and underscores' });
      return;
    }

    try {
      setCreating(true);
      setMessage(null);

      const response = await fetch('/api/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: selectedRepo,
          type: selectedType,
          name: branchName.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create working tree');
      }

      setMessage({ type: 'success', text: `Working tree created: ${data.worktree.branch}` });
      setSelectedRepo('');
      setSelectedType('');
      setBranchName('');
      
      // Reload data
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to create working tree' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (worktree: Worktree) => {
    if (!confirm(`Are you sure you want to delete the working tree "${worktree.branch}"?\n\nThis will remove the worktree and all its files.`)) {
      return;
    }

    try {
      setDeleting(worktree.path);
      setMessage(null);

      const response = await fetch('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: worktree.repo,
          type: worktree.type,
          name: worktree.name,
          path: worktree.path
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete working tree');
      }

      setMessage({ type: 'success', text: `Working tree "${worktree.branch}" deleted successfully` });
      
      // Reload data
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to delete working tree' });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">
          Git Working Tree Manager
        </h1>

        {/* Create New Working Tree */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">Create New Working Tree</h2>
          
          {message && (
            <div className={`mb-4 p-3 rounded ${
              message.type === 'success' 
                ? 'bg-green-100 text-green-800 border border-green-300' 
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}>
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repository
              </label>
              <select
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={creating}
              >
                <option value="">Select repository...</option>
                {repos.map((repo) => (
                  <option key={repo.key} value={repo.key}>
                    {REPO_DISPLAY_NAMES[repo.key] || repo.name} {repo.exists ? '✓' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={creating}
              >
                <option value="">Select type...</option>
                <option value="feat">New Feature</option>
                <option value="bugs">Bug Fix</option>
                <option value="fixes">Fix</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch Name
              </label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g., login-button"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={creating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creating && selectedRepo && selectedType && branchName.trim()) {
                    handleCreate();
                  }
                }}
              />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !selectedRepo || !selectedType || !branchName.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating...' : 'Create Working Tree'}
          </button>
        </div>

        {/* Existing Working Trees */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">Existing Working Trees</h2>
          
          {worktrees.length === 0 ? (
            <p className="text-gray-500">No working trees found. Create one above to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Repository
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Branch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Path
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {worktrees.map((wt, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {REPO_DISPLAY_NAMES[wt.repo] || wt.repoName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {TYPE_DISPLAY_NAMES[wt.type] || wt.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                        {wt.branch}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                        {wt.path}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleDelete(wt)}
                          disabled={deleting === wt.path}
                          className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-xs"
                        >
                          {deleting === wt.path ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
