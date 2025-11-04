import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const ROOT_DIR = process.env.REPO_ROOT || '/repos';

// Get the repo map from the worktrees route (same configuration)
function getRepoMap(): Record<string, { name: string; url: string }> {
  const githubOrg = process.env.GITHUB_ORG || 'AutoRemediation';
  const frontendRepo = process.env.FRONTEND_REPO || 'sideline-frontend';
  const viewerRepo = process.env.VIEWER_REPO || 'ohif-viewer';
  const backendRepo = process.env.BACKEND_REPO || 'sideline-backend';
  const frontendKey = process.env.FRONTEND_KEY || 'frontend';
  const viewerKey = process.env.VIEWER_KEY || 'viewer';
  const backendKey = process.env.BACKEND_KEY || 'backend';
  
  return {
    [frontendKey]: { name: frontendRepo, url: `https://github.com/${githubOrg}/${frontendRepo}` },
    [viewerKey]: { name: viewerRepo, url: `https://github.com/${githubOrg}/${viewerRepo}` },
    [backendKey]: { name: backendRepo, url: `https://github.com/${githubOrg}/${backendRepo}` }
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ repo: string }> | { repo: string } }
) {
  try {
    const params = await (context.params instanceof Promise ? context.params : Promise.resolve(context.params));
    const repoKey = params.repo;
    const REPO_MAP = getRepoMap();
    const config = REPO_MAP[repoKey];
    
    if (!config) {
      return NextResponse.json(
        { error: `Invalid repository: ${repoKey}` },
        { status: 400 }
      );
    }
    
    const repoPath = path.join(ROOT_DIR, config.name);
    
    if (!existsSync(repoPath) || !existsSync(path.join(repoPath, '.git'))) {
      return NextResponse.json({ branches: [] });
    }
    
    try {
      // Fetch latest branches from remote and prune deleted branches
      await execAsync('git fetch origin --prune', { cwd: repoPath }).catch(() => {});
      
      // Get only remote branches (this ensures we only see branches that exist on remote)
      const { stdout } = await execAsync('git branch -r', { cwd: repoPath });
      const branches: string[] = [];
      const seen = new Set<string>();
      
      // Parse branch names and prioritize common branches
      const commonBranches = ['dev', 'main', 'master', 'develop', 'staging', 'production'];
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip HEAD pointer and empty lines
        if (!trimmed || trimmed.includes('->') || trimmed === 'HEAD') {
          continue;
        }
        
        // Extract branch name (format: origin/branch-name)
        const match = trimmed.match(/^origin\/(.+)$/);
        if (match) {
          const branchName = match[1];
          
          // Skip worktree branches (starts with repo name followed by hyphen)
          if (branchName.startsWith(config.name + '-')) {
            continue;
          }
          
          // Add branch if we haven't seen it
          if (!seen.has(branchName)) {
            seen.add(branchName);
            branches.push(branchName);
          }
        }
      }
      
      // Sort: common branches first, then alphabetically
      branches.sort((a, b) => {
        const aIndex = commonBranches.indexOf(a);
        const bIndex = commonBranches.indexOf(b);
        
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
      });
      
      return NextResponse.json({ branches });
    } catch (error: any) {
      console.warn(`Failed to get branches for ${repoKey}:`, error);
      // Return default branches if git command fails
      return NextResponse.json({ branches: ['dev', 'main', 'master'] });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch branches' },
      { status: 500 }
    );
  }
}
