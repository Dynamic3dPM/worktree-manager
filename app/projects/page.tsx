'use client';

import { useState, useEffect } from 'react';

interface ProjectColumn {
  id: string;
  name: string;
  purpose: string;
  items: ProjectItem[];
}

interface ProjectItem {
  id: string;
  content_url?: string;
  content_type?: string;
  created_at: string;
  updated_at: string;
  note?: string;
  title?: string;
  archived?: boolean;
}

interface Project {
  id: string;
  number: number;
  title: string;
  body: string;
  state: string;
}

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [columns, setColumns] = useState<ProjectColumn[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ itemId: string; columnId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    loadProject();
    
    // Auto-refresh every 30 seconds to sync with GitHub Projects
    const interval = setInterval(() => {
      loadProject();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadProject = async () => {
    try {
      setLoading(true);
      setError(null);

      // First, get or create the workspace project
      const projectsRes = await fetch('/api/projects');
      const projectsData = await projectsRes.json();

      if (!projectsRes.ok) {
        // Provide helpful error message
        const errorMsg = projectsData.error || 'Failed to fetch projects';
        const suggestion = projectsData.suggestion || '';
        throw new Error(`${errorMsg}${suggestion ? '\n\n' + suggestion : ''}`);
      }

      // Find existing project or create one
      const projectName = 'Worktree Manager Project';
      let workspaceProject = projectsData.projects?.find(
        (p: Project) => p.title === projectName && p.state === 'open'
      );

      if (!workspaceProject) {
        // Create new project
        const createRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          const createError = createData.error || 'Failed to create project';
          throw new Error(`${createError}\n\nMake sure your GitHub token has Projects permissions (read & write).`);
        }
        workspaceProject = createData.project;
      }

      setProject(workspaceProject);
      setProjectId(workspaceProject.id);

      // Load project details with columns
      const projectRes = await fetch(`/api/projects/${workspaceProject.id}`);
      const projectData = await projectRes.json();

      if (!projectRes.ok) {
        throw new Error(projectData.error || 'Failed to fetch project details');
      }

      setColumns(projectData.columns || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (itemId: string, columnId: string) => {
    setDraggedItem({ itemId, columnId });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (targetColumnId: string) => {
    if (!draggedItem || !projectId) return;

    if (draggedItem.columnId === targetColumnId) {
      setDraggedItem(null);
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: draggedItem.itemId,
          columnId: targetColumnId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to move item');
      }

      // Reload project data
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to move item');
      console.error('Failed to move item:', err);
    } finally {
      setDraggedItem(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!projectId) return;
    
    if (!confirm('Are you sure you want to delete this item from the project?')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete item');
      }

      // Reload project data
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to delete item');
      console.error('Failed to delete item:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p className="font-bold">Error</p>
            <p>{error}</p>
            <button
              onClick={loadProject}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-full mx-auto px-4">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">
          {project?.title || 'Projects'}
        </h1>

        {columns.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-gray-500">
              No columns found. The project may need to be initialized with columns.
            </p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((column) => (
              <div
                key={column.id}
                className="flex-shrink-0 w-80 bg-gray-100 rounded-lg p-4"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(column.id)}
              >
                <h2 className="text-lg font-semibold mb-4 text-gray-800">
                  {column.name}
                </h2>
                <div className="space-y-3 min-h-[200px]">
                  {column.items
                    .filter((item) => !item.archived)
                    .map((item) => {
                      // Parse note to extract title and body
                      const note = item.note || '';
                      const lines = note.split('\n');
                      const title = lines[0] || 'Untitled Item';
                      const body = lines.slice(1).join('\n').trim();

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => handleDragStart(item.id, column.id)}
                          onDragEnd={handleDragEnd}
                          className={`bg-white rounded-lg shadow p-4 cursor-move hover:shadow-md transition-shadow ${
                            draggedItem?.itemId === item.id ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-medium text-gray-900 flex-1">
                              {item.title || title}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteItem(item.id);
                              }}
                              className="ml-2 text-red-600 hover:text-red-800 text-sm"
                              title="Delete item"
                            >
                              ×
                            </button>
                          </div>
                          {body && (
                            <div className="text-sm text-gray-600 mb-2 whitespace-pre-wrap">
                              {body}
                            </div>
                          )}
                          {item.content_url && (
                            <a
                              href={item.content_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View Issue
                            </a>
                          )}
                          {item.created_at && (
                            <div className="text-xs text-gray-500 mt-2">
                              {new Date(item.created_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {column.items.filter((item) => !item.archived).length === 0 && (
                    <div className="text-gray-400 text-sm text-center py-8">
                      No items
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

