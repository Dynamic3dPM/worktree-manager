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
  fixes: 'Fix',
  qaqc: 'QAQC'
};

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [branchName, setBranchName] = useState('');
  const [repoBranches, setRepoBranches] = useState<Record<string, string[]>>({});
  const [baseBranches, setBaseBranches] = useState<Record<string, string>>({});
  const [loadingBranches, setLoadingBranches] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creatingProgress, setCreatingProgress] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Load branches for selected repos
  useEffect(() => {
    const loadBranchesForRepos = async () => {
      for (const repoKey of selectedRepos) {
        if (!repoBranches[repoKey] && !loadingBranches[repoKey]) {
          setLoadingBranches(prev => ({ ...prev, [repoKey]: true }));
          try {
            const response = await fetch(`/api/repos/${repoKey}/branches`);
            const data = await response.json();
            if (data.branches) {
              setRepoBranches(prev => ({ ...prev, [repoKey]: data.branches }));
              // Set default base branch if not already set
              setBaseBranches(prev => {
                if (!prev[repoKey] && data.branches.length > 0) {
                  // Prefer dev, then main, then master, then first available
                  const preferred = data.branches.find((b: string) => ['dev', 'main', 'master'].includes(b)) || data.branches[0];
                  return { ...prev, [repoKey]: preferred };
                }
                return prev;
              });
            }
          } catch (error) {
            console.error(`Failed to load branches for ${repoKey}:`, error);
          } finally {
            setLoadingBranches(prev => ({ ...prev, [repoKey]: false }));
          }
        }
      }
    };
    
    if (selectedRepos.length > 0) {
      loadBranchesForRepos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepos]);

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

  const toggleRepo = (repoKey: string, event: React.MouseEvent) => {
    // Support Ctrl+click for multi-select
    if (event.ctrlKey || event.metaKey) {
      setSelectedRepos(prev => 
        prev.includes(repoKey) 
          ? prev.filter(r => r !== repoKey)
          : [...prev, repoKey]
      );
    } else {
      // Single click: toggle the repo
      setSelectedRepos(prev => 
        prev.includes(repoKey) 
          ? prev.filter(r => r !== repoKey)
          : [...prev, repoKey]
      );
    }
  };

  const handleCreate = async () => {
    if (selectedRepos.length === 0 || !selectedType || !branchName.trim()) {
      setMessage({ type: 'error', text: 'Please select at least one repository and fill in all fields' });
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
      setCreatingProgress(null);

      const response = await fetch('/api/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repos: selectedRepos,
          type: selectedType,
          name: branchName.trim(),
          baseBranches: baseBranches
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Include detailed errors if available
        let errorMessage = data.error || 'Failed to create working trees';
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          const detailedErrors = data.errors.map((err: any) => {
            const repoName = REPO_DISPLAY_NAMES[err.repo] || err.repo;
            return `${repoName}: ${err.error}`;
          }).join('; ');
          errorMessage = `${errorMessage} (${detailedErrors})`;
        }
        throw new Error(errorMessage);
      }

      // Build success message with results
      const successCount = data.worktrees?.length || 0;
      const errorCount = data.errors?.length || 0;
      let messageText = '';
      
      if (errorCount === 0) {
        messageText = `Successfully created ${successCount} working tree${successCount > 1 ? 's' : ''}${successCount > 1 ? ` in ${successCount} repositories` : ''}`;
        if (successCount > 1) {
          const repoNames = data.worktrees.map((wt: any) => REPO_DISPLAY_NAMES[wt.repo] || wt.repoName).join(', ');
          messageText += `: ${repoNames}`;
        }
      } else {
        const successRepos = data.worktrees?.map((wt: any) => REPO_DISPLAY_NAMES[wt.repo] || wt.repoName) || [];
        const failedRepos = data.errors?.map((err: any) => REPO_DISPLAY_NAMES[err.repo] || err.repo).join(', ') || '';
        messageText = `Created ${successCount} working tree${successCount > 1 ? 's' : ''}${successRepos.length > 0 ? ` in ${successRepos.join(', ')}` : ''}${failedRepos ? `. Failed in ${failedRepos}` : ''}`;
      }

      setMessage({ type: errorCount > 0 ? 'error' : 'success', text: messageText });
      setSelectedRepos([]);
      setSelectedType('');
      setBranchName('');
      setBaseBranches({});
      
      // Reload data
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to create working trees' });
    } finally {
      setCreating(false);
      setCreatingProgress(null);
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
          Git Working Trees
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
              <div className="whitespace-pre-wrap break-words">{message.text}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repositories {selectedRepos.length > 0 && <span className="text-blue-600">({selectedRepos.length} selected)</span>}
              </label>
              <div className="border border-gray-300 rounded-md p-3 bg-white max-h-48 overflow-y-auto">
                {repos.length === 0 ? (
                  <p className="text-sm text-gray-500">No repositories available</p>
                ) : (
                  <div className="space-y-2">
                    {repos.map((repo) => (
                      <label
                        key={repo.key}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                        onClick={(e) => toggleRepo(repo.key, e)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRepos.includes(repo.key)}
                          onChange={() => {}} // Handled by onClick
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          disabled={creating}
                        />
                        <span className="text-sm text-gray-700 flex-1">
                          {REPO_DISPLAY_NAMES[repo.key] || repo.name} {repo.exists ? '✓' : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">Click to select. Hold Ctrl/Cmd and click for multiple selection.</p>
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
                <option value="qaqc">QAQC</option>
              </select>
            </div>

            {selectedRepos.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base Branch (for each repository)
                </label>
                <div className="space-y-2">
                  {selectedRepos.map((repoKey) => {
                    const repo = repos.find(r => r.key === repoKey);
                    const branches = repoBranches[repoKey] || [];
                    const isLoading = loadingBranches[repoKey];
                    
                    return (
                      <div key={repoKey} className="flex items-center gap-3">
                        <label className="text-sm text-gray-600 w-32 flex-shrink-0">
                          {REPO_DISPLAY_NAMES[repoKey] || repo?.name || repoKey}:
                        </label>
                        <select
                          value={baseBranches[repoKey] || ''}
                          onChange={(e) => setBaseBranches(prev => ({ ...prev, [repoKey]: e.target.value }))}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          disabled={creating || isLoading}
                        >
                          {isLoading ? (
                            <option>Loading branches...</option>
                          ) : branches.length === 0 ? (
                            <option>No branches available</option>
                          ) : (
                            <>
                              <option value="">Select base branch...</option>
                              {branches.map((branch) => (
                                <option key={branch} value={branch}>
                                  {branch}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  if (e.key === 'Enter' && !creating && selectedRepos.length > 0 && selectedType && branchName.trim()) {
                    handleCreate();
                  }
                }}
              />
            </div>
          </div>

          {creatingProgress && (
            <div className="mb-4 text-sm text-blue-600">
              {creatingProgress}
            </div>
          )}
          <button
            onClick={handleCreate}
            disabled={creating || selectedRepos.length === 0 || !selectedType || !branchName.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? `Creating in ${selectedRepos.length} repositor${selectedRepos.length > 1 ? 'ies' : 'y'}...` : `Create Working Tree${selectedRepos.length > 1 ? 's' : ''}`}
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
