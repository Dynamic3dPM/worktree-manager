import path from 'path';
import { existsSync, readFileSync } from 'fs';

const ROOT_DIR = process.env.REPO_ROOT || '/repos';

// Helper function to get GitHub token (same as in worktrees route)
function getGitHubToken(): string | null {
  let token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    const tokenFiles = [
      path.join(ROOT_DIR, '..', '.github-token'),
      path.join(ROOT_DIR, '..', 'token'),
      path.join(ROOT_DIR, '..', 'GITHUB_TOKEN'),
      path.join(ROOT_DIR, '.github-token'),
      path.join(ROOT_DIR, 'token'),
      path.join(ROOT_DIR, 'GITHUB_TOKEN'),
    ];
    
    for (const tokenFile of tokenFiles) {
      try {
        if (existsSync(tokenFile)) {
          token = readFileSync(tokenFile, 'utf-8').trim();
          break;
        }
      } catch {
        // Continue to next file
      }
    }
  }
  
  return token || null;
}

const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubProject {
  id: string;
  number: number;
  title: string;
  body: string;
  state: string;
  owner_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubProjectItem {
  id: string;
  content_url?: string;
  content_type?: string;
  created_at: string;
  updated_at: string;
  note?: string;
}

export interface GitHubProjectField {
  id: string;
  name: string;
  dataType: string;
}

export interface GitHubProjectFieldValue {
  fieldId: string;
  value?: string;
}

export interface ProjectColumn {
  id: string;
  name: string;
  purpose: string;
}

/**
 * Get authenticated fetch headers
 */
function getAuthHeaders(): HeadersInit {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('GITHUB_TOKEN not found');
  }
  
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Get the authenticated user's login
 */
export async function getAuthenticatedUser(): Promise<string> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/user`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get authenticated user: ${response.status} ${error}`);
  }
  
  const user = await response.json();
  return user.login;
}

/**
 * List all projects for an organization
 */
export async function listOrgProjects(org: string): Promise<GitHubProject[]> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/orgs/${org}/projects`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    // If 404, try user projects as fallback
    if (response.status === 404) {
      const user = await getAuthenticatedUser();
      return listUserProjects(user);
    }
    const error = await response.text();
    throw new Error(`Failed to list projects: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * List all projects for a user
 */
export async function listUserProjects(username: string): Promise<GitHubProject[]> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/users/${username}/projects`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list user projects: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Create a new project for an organization
 */
export async function createOrgProject(
  org: string,
  name: string,
  body?: string
): Promise<GitHubProject> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/orgs/${org}/projects`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      body: body || '',
    }),
  });
  
  if (!response.ok) {
    // If 404, try creating user project as fallback
    if (response.status === 404) {
      const user = await getAuthenticatedUser();
      return createUserProject(user, name, body);
    }
    const error = await response.text();
    throw new Error(`Failed to create project: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Create a new project for a user
 */
export async function createUserProject(
  username: string,
  name: string,
  body?: string
): Promise<GitHubProject> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/users/${username}/projects`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      body: body || '',
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create user project: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Get project details by ID
 */
export async function getProject(projectId: string): Promise<GitHubProject> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/projects/${projectId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get project: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Get project columns
 */
export async function getProjectColumns(projectId: string): Promise<ProjectColumn[]> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/projects/${projectId}/columns`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get project columns: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Get items in a project column
 */
export async function getColumnItems(columnId: string): Promise<GitHubProjectItem[]> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/projects/columns/${columnId}/cards`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get column items: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Create a draft issue and add it to a project column
 * Note: projectId is not used in the API call but kept for API consistency
 */
export async function createDraftIssue(
  projectId: string,
  columnId: string,
  title: string,
  body?: string
): Promise<GitHubProjectItem> {
  const headers = getAuthHeaders();
  
  // For GitHub Projects API v2, we need to add to a column directly
  // Create draft issue as a card in the column
  const createUrl = `${GITHUB_API_BASE}/projects/columns/${columnId}/cards`;
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      note: body ? `${title}\n\n${body}` : title,
    }),
  });
  
  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create draft issue: ${createResponse.status} ${error}`);
  }
  
  const item = await createResponse.json();
  
  return item;
}

/**
 * Move an item (card) to a different column
 */
export async function moveItemToColumn(
  itemId: string,
  columnId: string,
  position: 'top' | 'bottom' | `after:${string}` = 'bottom'
): Promise<void> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/projects/columns/cards/${itemId}/moves`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      position,
      column_id: columnId,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to move item: ${response.status} ${error}`);
  }
}

/**
 * Update a project item (draft issue card)
 */
export async function updateProjectItem(
  itemId: string,
  title?: string,
  body?: string
): Promise<GitHubProjectItem> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/projects/columns/cards/${itemId}`;
  
  const updateData: any = {};
  if (body !== undefined) {
    updateData.note = title ? `${title}\n\n${body}` : body;
  } else if (title) {
    updateData.note = title;
  }
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updateData),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update item: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Delete a project item (card)
 */
export async function deleteProjectItem(itemId: string): Promise<void> {
  const headers = getAuthHeaders();
  const url = `${GITHUB_API_BASE}/projects/columns/cards/${itemId}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete item: ${response.status} ${error}`);
  }
}

/**
 * Find project items by worktree metadata
 * Matches cards by branch name and repository in the note/body
 */
export async function findProjectItemByWorktree(
  projectId: string,
  repoName: string,
  branchName: string
): Promise<GitHubProjectItem | null> {
  const columns = await getProjectColumns(projectId);
  
  // Search through all columns
  for (const column of columns) {
    const items = await getColumnItems(column.id);
    
    for (const item of items) {
      // Check if item note contains worktree metadata
      const note = item.note || '';
      // Match by branch name and repository
      if (note.includes(`Branch: ${branchName}`) && note.includes(`Repository: ${repoName}`)) {
        return item;
      }
    }
  }
  
  return null;
}

/**
 * Find or create a project for the workspace
 */
export async function findOrCreateWorkspaceProject(
  org: string,
  projectName?: string
): Promise<GitHubProject> {
  const name = projectName || process.env.GITHUB_PROJECT_NAME || 'Worktree Manager Project';
  
  // Try to find existing project in org
  try {
    const projects = await listOrgProjects(org);
    const existing = projects.find(p => p.title === name && p.state === 'open');
    if (existing) {
      return existing;
    }
  } catch (error: any) {
    // If org projects fail, try user projects
    if (error.message?.includes('404') || error.message?.includes('Failed to list')) {
      try {
        const user = await getAuthenticatedUser();
        const userProjects = await listUserProjects(user);
        const existing = userProjects.find(p => p.title === name && p.state === 'open');
        if (existing) {
          return existing;
        }
        // Create user project if not found
        return createUserProject(user, name, `Project for managing worktrees across repositories`);
      } catch (userError) {
        console.warn('Failed to list/create user projects:', userError);
        // Fall through to try creating org project
      }
    } else {
      console.warn('Failed to list org projects, will try to create new one:', error);
    }
  }
  
  // Create new project if not found (try org first, then user)
  try {
    return await createOrgProject(org, name, `Project for managing worktrees across repositories`);
  } catch (error: any) {
    // If org creation fails, try user project
    if (error.message?.includes('404')) {
      const user = await getAuthenticatedUser();
      return createUserProject(user, name, `Project for managing worktrees across repositories`);
    }
    throw error;
  }
}

/**
 * Get or create the backlog column for a project
 */
export async function getOrCreateBacklogColumn(projectId: string): Promise<string> {
  const columns = await getProjectColumns(projectId);
  
  // Look for existing "Backlog" column
  const backlog = columns.find(col => 
    col.name.toLowerCase() === 'backlog' || col.purpose === 'backlog'
  );
  
  if (backlog) {
    return backlog.id;
  }
  
  // If no backlog column exists, return the first column (or create one)
  // For now, we'll use the first column. In a full implementation, we could create a backlog column.
  if (columns.length > 0) {
    return columns[0].id;
  }
  
  throw new Error('Project has no columns');
}

