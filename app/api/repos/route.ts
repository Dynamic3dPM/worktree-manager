import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Repository configuration - can be overridden via environment variables
// Format: GITHUB_ORG=yourorg,REPO_KEY=repo-name,REPO_KEY=repo-name2
// Example: GITHUB_ORG=myorg,FRONTEND_REPO=my-frontend,BACKEND_REPO=my-backend
const getRepoMap = (): Record<string, { name: string; url: string }> => {
  const githubOrg = process.env.GITHUB_ORG || 'AutoRemediation';
  
  // Allow custom repository configuration via environment variables
  // Format: REPO_KEY=repo-name or use defaults
  const frontendRepo = process.env.FRONTEND_REPO || 'sideline-frontend';
  const viewerRepo = process.env.VIEWER_REPO || 'ohif-viewer';
  const backendRepo = process.env.BACKEND_REPO || 'sideline-backend';
  
  // Support custom repository keys via env var
  // Format: FRONTEND_KEY=frontend,VIEWER_KEY=viewer,BACKEND_KEY=backend
  const frontendKey = process.env.FRONTEND_KEY || 'frontend';
  const viewerKey = process.env.VIEWER_KEY || 'viewer';
  const backendKey = process.env.BACKEND_KEY || 'backend';
  
  return {
    [frontendKey]: {
      name: frontendRepo,
      url: `https://github.com/${githubOrg}/${frontendRepo}`
    },
    [viewerKey]: {
      name: viewerRepo,
      url: `https://github.com/${githubOrg}/${viewerRepo}`
    },
    [backendKey]: {
      name: backendRepo,
      url: `https://github.com/${githubOrg}/${backendRepo}`
    }
  };
};

const REPO_MAP = getRepoMap();

const ROOT_DIR = process.env.REPO_ROOT || '/repos';

export async function GET() {
  try {
    const repos = [];
    
    for (const [key, config] of Object.entries(REPO_MAP)) {
      const repoPath = path.join(ROOT_DIR, config.name);
      const gitPath = path.join(repoPath, '.git');
      const exists = existsSync(repoPath) && existsSync(gitPath);
      
      repos.push({
        key,
        name: config.name,
        url: config.url,
        exists,
        path: repoPath
      });
    }
    
    return NextResponse.json({ repos });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}




