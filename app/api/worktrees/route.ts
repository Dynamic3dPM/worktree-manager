import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync, mkdirSync } from 'fs';
import path from 'path';
import {
  findOrCreateWorkspaceProject,
  getOrCreateBacklogColumn,
  createDraftIssue,
  findProjectItemByWorktree,
  deleteProjectItem,
} from '@/app/lib/github-projects';

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

// Create a reverse lookup map from repo name to key and config
const REPO_NAME_MAP: Record<string, { key: string; config: { name: string; url: string } }> = {};
for (const [key, config] of Object.entries(REPO_MAP)) {
  REPO_NAME_MAP[config.name] = { key, config };
}

const VALID_TYPES = ['feat', 'bugs', 'fixes'];
const ROOT_DIR = process.env.REPO_ROOT || '/repos';
const HOST_ROOT_DIR = process.env.HOST_REPO_ROOT || ROOT_DIR;
    // Worktrees are organized in Tree/{repo}/{branchName} at the root level
    // Use ROOT_DIR (container path) for actual file operations, HOST_ROOT_DIR is only for path translation
    const WORKTREE_ROOT = process.env.WORKTREE_ROOT || path.join(ROOT_DIR, 'Tree');

// Helper function to get GitHub token
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

// Helper function to create a worktree for a single repository
// Accepts either repo name (GitHub repo name) or repo key for backward compatibility
async function createWorktreeForRepo(
  repo: string,
  type: string,
  name: string,
  baseBranch?: string
): Promise<{ success: boolean; worktree?: any; error?: string }> {
  try {
    // First try to find by repo name (GitHub repo name)
    let repoKey: string | undefined;
    let config: { name: string; url: string } | undefined;
    
    if (REPO_NAME_MAP[repo]) {
      // Found by repo name
      repoKey = REPO_NAME_MAP[repo].key;
      config = REPO_NAME_MAP[repo].config;
    } else if (REPO_MAP[repo]) {
      // Found by repo key (backward compatibility)
      repoKey = repo;
      config = REPO_MAP[repo];
    } else {
      return { success: false, error: `Invalid repository: ${repo}` };
    }
    
    const repoPath = path.join(ROOT_DIR, config.name);
    const branchName = `${config.name}-${type}-${name}`;
    // Worktrees are organized in Tree/{repo}/{branchName} where branchName includes repo prefix
    const worktreePath = path.join(WORKTREE_ROOT, config.name, branchName);
    
    // Ensure WORKTREE_ROOT and repository directory exist (mkdir -p style)
    const worktreeDir = path.join(WORKTREE_ROOT, config.name);
    try {
      mkdirSync(worktreeDir, { recursive: true });
      console.log(`Ensured worktree directory exists: ${worktreeDir}`);
    } catch (error: any) {
      return { 
        success: false, 
        error: `Failed to create worktree directory ${worktreeDir}: ${error.message}` 
      };
    }
    
    // Check if worktree path would conflict with a main repository
    // Main repos have .git as a directory, worktrees have .git as a file
    if (existsSync(worktreePath)) {
      const gitPath = path.join(worktreePath, '.git');
      if (existsSync(gitPath)) {
        try {
          const stat = statSync(gitPath);
          if (stat.isDirectory()) {
            return { 
              success: false, 
              error: `Path ${worktreePath} conflicts with an existing repository directory. Please use a different branch name.` 
            };
          }
        } catch {
          // Continue - might be a worktree
        }
      }
    }
    
    // Check if repo exists, if not clone it
    if (!existsSync(repoPath) || !existsSync(path.join(repoPath, '.git'))) {
      const token = getGitHubToken();
      
      if (!token) {
        return { 
          success: false, 
          error: 'GITHUB_TOKEN not found. Please set GITHUB_TOKEN environment variable or create a token file.' 
        };
      }
      
      const authUrl = config.url.replace('https://', `https://${token}@`);
      await execAsync(`git clone ${authUrl} ${repoPath}`, {
        cwd: ROOT_DIR,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
    }
    
    // Ensure we're in the repo directory
    // Check if dev branch exists, create it if needed
    try {
      await execAsync('git fetch origin', { cwd: repoPath });
      
      try {
        await execAsync('git checkout dev', { cwd: repoPath });
        await execAsync('git pull origin dev', { cwd: repoPath }).catch(() => {});
      } catch {
        try {
          await execAsync('git checkout -b dev origin/dev', { cwd: repoPath });
        } catch {
          try {
            try {
              await execAsync('git checkout main', { cwd: repoPath });
            } catch {
              await execAsync('git checkout -b main origin/main', { cwd: repoPath });
            }
            await execAsync('git checkout -b dev', { cwd: repoPath });
          } catch {
            try {
              await execAsync('git checkout master', { cwd: repoPath });
            } catch {
              await execAsync('git checkout -b master origin/master', { cwd: repoPath });
            }
            await execAsync('git checkout -b dev', { cwd: repoPath });
          }
        }
      }
    } catch (err) {
      // Continue anyway
    }
    
    // Check if branch already exists
    let branchExists = false;
    try {
      await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
        cwd: repoPath
      });
      branchExists = true;
    } catch {
      branchExists = false;
    }
    
    // Check if worktree already exists at the target path
    if (existsSync(worktreePath)) {
      console.log(`Worktree directory already exists at ${worktreePath}, checking if it's registered with git...`);
      try {
        const { stdout } = await execAsync('git worktree list', { cwd: repoPath });
        const worktreeLines = stdout.trim().split('\n');
        let isRegistered = false;
        let existingBranch = '';
        
        const normalizePath = (p: string) => {
          let normalized = p.replace(/\/$/, '');
          if (normalized.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
            normalized = normalized.replace(HOST_ROOT_DIR, ROOT_DIR);
          }
          return normalized;
        };
        const normalizedTargetPath = normalizePath(worktreePath);
        
        for (const line of worktreeLines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 2) continue;
          const existingPath = parts[0];
          const branchInfo = line.match(/\[(.*?)\]/);
          const normalizedExistingPath = normalizePath(existingPath);
          
          if (normalizedExistingPath === normalizedTargetPath) {
            isRegistered = true;
            if (branchInfo) {
              existingBranch = branchInfo[1];
            }
            break;
          }
        }
        
        if (isRegistered) {
          console.log(`Worktree is registered at ${worktreePath} with branch ${existingBranch}`);
          if (existingBranch === branchName) {
            console.log(`Removing existing worktree at ${worktreePath} (same branch ${branchName})`);
            try {
              await execAsync(`git worktree remove "${worktreePath}" --force`, {
                cwd: repoPath
              });
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error: any) {
              console.warn(`Failed to remove worktree via git: ${error.message}`);
              try {
                rmSync(worktreePath, { recursive: true, force: true });
              } catch (rmError: any) {
                return { success: false, error: `Failed to remove existing worktree: ${rmError.message}` };
              }
            }
          } else {
            console.log(`Worktree at ${worktreePath} uses different branch ${existingBranch}, not removing`);
            return { 
              success: false, 
              error: `A worktree already exists at ${worktreePath} with a different branch (${existingBranch}). Please use a different name.` 
            };
          }
        } else {
          console.log(`Directory exists at ${worktreePath} but is not a registered worktree, removing...`);
          try {
            // Check if it's a main repository before removing
            const gitPath = path.join(worktreePath, '.git');
            if (existsSync(gitPath)) {
              try {
                const stat = statSync(gitPath);
                if (stat.isDirectory()) {
                  return { 
                    success: false, 
                    error: `Cannot remove directory at ${worktreePath} - it appears to be a main repository. Please use a different branch name.` 
                  };
                }
              } catch {
                // Continue - might be a worktree .git file
              }
            }
            rmSync(worktreePath, { recursive: true, force: true });
          } catch (error: any) {
            return { success: false, error: `Directory exists at ${worktreePath} and could not be removed: ${error.message}` };
          }
        }
      } catch (error: any) {
        console.warn(`Failed to check worktree list: ${error.message}, checking directory...`);
        // Before removing, verify it's not a main repository
        const gitPath = path.join(worktreePath, '.git');
        if (existsSync(gitPath)) {
          try {
            const stat = statSync(gitPath);
            if (stat.isDirectory()) {
              return { 
                success: false, 
                error: `Cannot use path ${worktreePath} - it is a main repository directory. Please use a different branch name.` 
              };
            }
          } catch {
            // Continue - might be a worktree .git file
          }
        }
        try {
          rmSync(worktreePath, { recursive: true, force: true });
        } catch (rmError: any) {
          return { success: false, error: `Directory exists at ${worktreePath} and could not be removed: ${rmError.message}` };
        }
      }
    }
    
    // Check if branch is already used by another worktree or checked out in main repo
    try {
      // First, prune any prunable worktrees to clean up orphaned entries
      try {
        await execAsync('git worktree prune', { cwd: repoPath });
        console.log('Pruned any prunable worktrees');
        
        // Also remove the worktree registration if the directory doesn't exist
        // Check if our target worktree path would conflict with a prunable entry
        const { stdout: worktreeListBefore } = await execAsync('git worktree list', { cwd: repoPath });
        const worktreeLinesBefore = worktreeListBefore.trim().split('\n');
        
        for (const line of worktreeLinesBefore) {
          if (line.includes('prunable')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              const prunablePath = parts[0];
              // If this prunable path matches our target or uses the same branch, remove it
              if (prunablePath.includes(branchName) || prunablePath === worktreePath) {
                try {
                  // Force remove the prunable worktree entry
                  await execAsync(`git worktree remove --force "${prunablePath}"`, {
                    cwd: repoPath
                  }).catch(() => {
                    // If that fails, try pruning again
                    return execAsync('git worktree prune', { cwd: repoPath });
                  });
                  console.log(`Removed prunable worktree entry for ${prunablePath}`);
                } catch (removeError) {
                  console.warn(`Failed to remove prunable worktree: ${removeError}`);
                }
              }
            }
          }
        }
      } catch (pruneError) {
        // Continue even if prune fails
        console.warn('Failed to prune worktrees:', pruneError);
      }
      
      try {
        const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
        const currentBranchName = currentBranch.trim();
        if (currentBranchName === branchName) {
          try {
            await execAsync('git checkout dev', { cwd: repoPath }).catch(async () => {
              await execAsync('git checkout main', { cwd: repoPath }).catch(async () => {
                await execAsync('git checkout master', { cwd: repoPath });
              });
            });
          } catch {
            // Continue
          }
        }
      } catch {
        // Continue
      }

      const { stdout } = await execAsync('git worktree list', { cwd: repoPath });
      const worktreeLines = stdout.trim().split('\n');
      
      const normalizePathForComparison = (p: string) => {
        let normalized = p.replace(/\/$/, '');
        if (normalized.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
          normalized = normalized.replace(HOST_ROOT_DIR, ROOT_DIR);
        }
        return normalized;
      };
      const normalizedTargetPath = normalizePathForComparison(worktreePath);
      
      for (const line of worktreeLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        
        const existingPath = parts[0];
        const branchInfo = line.match(/\[(.*?)\]/);
        const isPrunable = line.includes('prunable');
        
        if (branchInfo && branchInfo[1] === branchName) {
          if (existingPath === repoPath || existingPath.replace(/\/$/, '') === repoPath.replace(/\/$/, '')) {
            continue;
          }
          
          const normalizedExistingPath = normalizePathForComparison(existingPath);
          if (normalizedExistingPath !== normalizedTargetPath) {
            console.log(`Removing conflicting worktree at ${existingPath} (same branch ${branchName}, different path${isPrunable ? ', prunable' : ''})`);
            // Try to remove using absolute path (works even for prunable worktrees)
            const absolutePath = path.isAbsolute(existingPath) ? existingPath : path.resolve(repoPath, existingPath);
            
            // For prunable worktrees, the directory doesn't exist but git still has it registered
            // Try to remove it regardless of whether the directory exists
            try {
              // First try git worktree remove (works even if directory doesn't exist)
              await execAsync(`git worktree remove "${absolutePath}" --force`, {
                cwd: repoPath
              }).catch(async () => {
                // If that fails, try with the original path
                await execAsync(`git worktree remove "${existingPath}" --force`, {
                  cwd: repoPath
                });
              });
              // Wait for cleanup
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Verify it's actually removed from git
              const { stdout: verifyList } = await execAsync('git worktree list', { cwd: repoPath });
              const verifyLines = verifyList.trim().split('\n');
              const stillExists = verifyLines.some(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 2) return false;
                const linePath = parts[0];
                const normalizedLinePath = normalizePathForComparison(linePath);
                return normalizedLinePath === normalizedExistingPath;
              });
              
              if (stillExists) {
                console.warn(`Worktree still exists after removal attempt, trying git worktree prune`);
                // Try git worktree prune to clean up prunable worktrees
                try {
                  await execAsync('git worktree prune', { cwd: repoPath });
                  await new Promise(resolve => setTimeout(resolve, 500));
                } catch (pruneError: any) {
                  console.warn(`git worktree prune failed: ${pruneError.message}`);
                }
                
                // Try manual directory removal as fallback (only if directory exists)
                if (existsSync(absolutePath)) {
                  rmSync(absolutePath, { recursive: true, force: true });
                } else if (existsSync(existingPath)) {
                  rmSync(existingPath, { recursive: true, force: true });
                }
              }
              
              console.log(`Successfully removed conflicting worktree at ${existingPath}`);
            } catch (error: any) {
              console.warn(`Failed to remove conflicting worktree via git: ${error.message}`);
              
              // For prunable worktrees, try git worktree prune
              if (isPrunable) {
                try {
                  console.log(`Trying git worktree prune to clean up prunable worktree`);
                  await execAsync('git worktree prune', { cwd: repoPath });
                  await new Promise(resolve => setTimeout(resolve, 500));
                  console.log(`Successfully pruned worktree`);
                } catch (pruneError: any) {
                  console.warn(`git worktree prune failed: ${pruneError.message}`);
                  return {
                    success: false,
                    error: `Failed to remove conflicting prunable worktree at ${existingPath}. Please run 'git worktree prune' manually in ${repoPath} and try again.`
                  };
                }
              } else {
                // Try manual cleanup as fallback (only if directory exists)
                try {
                  if (existsSync(absolutePath)) {
                    rmSync(absolutePath, { recursive: true, force: true });
                  } else if (existsSync(existingPath)) {
                    rmSync(existingPath, { recursive: true, force: true });
                  }
                  console.log(`Manually removed directory at ${existingPath}`);
                } catch (rmError: any) {
                  console.error(`Failed to manually remove directory: ${rmError.message}`);
                  return {
                    success: false,
                    error: `Failed to remove conflicting worktree at ${existingPath}. Please remove it manually and try again.`
                  };
                }
              }
            }
          } else {
            console.log(`Worktree with branch ${branchName} already exists at target path, will be replaced`);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to list worktrees:', error);
    }
    
    // Ensure we're not on the branch we're trying to create a worktree for
    try {
      const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
      const currentBranchName = currentBranch.trim();
      if (currentBranchName === branchName) {
        try {
          await execAsync('git checkout dev', { cwd: repoPath }).catch(async () => {
            await execAsync('git checkout main', { cwd: repoPath }).catch(async () => {
              await execAsync('git checkout master', { cwd: repoPath });
            });
          });
        } catch {
          // Continue
        }
      }
    } catch {
      // Continue
    }
    
    // Ensure parent directory exists (already created above, but double-check)
    const parentDir = path.dirname(worktreePath);
    if (!existsSync(parentDir)) {
      try {
        mkdirSync(parentDir, { recursive: true });
        console.log(`Created parent directory: ${parentDir}`);
      } catch (error: any) {
        return { 
          success: false, 
          error: `Failed to create parent directory ${parentDir}: ${error.message}` 
        };
      }
    }
    
    // Determine the base branch to create the worktree from
    // Use provided baseBranch or detect available branch
    let resolvedBaseBranch = baseBranch || 'dev';
    if (!branchExists) {
      if (baseBranch) {
        // Verify the provided base branch exists
        try {
          await execAsync(`git show-ref --verify --quiet refs/heads/${baseBranch}`, { cwd: repoPath });
        } catch {
          // Try remote branch
          try {
            await execAsync(`git show-ref --verify --quiet refs/remotes/origin/${baseBranch}`, { cwd: repoPath });
            // Checkout the remote branch locally first
            await execAsync(`git checkout -b ${baseBranch} origin/${baseBranch}`, { cwd: repoPath }).catch(() => {});
          } catch {
            console.warn(`Base branch ${baseBranch} not found in ${repoPath}, trying defaults...`);
            resolvedBaseBranch = 'dev'; // Will be overridden by fallback below
          }
        }
      }
      
      // Fallback to detecting available branches if baseBranch not provided or not found
      if (!baseBranch) {
        try {
          await execAsync('git show-ref --verify --quiet refs/heads/dev', { cwd: repoPath });
          resolvedBaseBranch = 'dev';
        } catch {
          try {
            await execAsync('git show-ref --verify --quiet refs/heads/main', { cwd: repoPath });
            resolvedBaseBranch = 'main';
          } catch {
            try {
              await execAsync('git show-ref --verify --quiet refs/heads/master', { cwd: repoPath });
              resolvedBaseBranch = 'master';
            } catch {
              console.warn(`Neither dev, main, nor master branch found in ${repoPath}. Defaulting to 'dev'.`);
              resolvedBaseBranch = 'dev';
            }
          }
        }
      }
    } else {
      // Branch exists, use it directly (won't be used in worktree command but keep for reference)
      resolvedBaseBranch = branchName;
    }
    
    // Create working tree
    // If branch exists, use it; otherwise create new branch from resolvedBaseBranch
    // IMPORTANT: Use container path (ROOT_DIR) for worktree creation to ensure git stores correct paths
    const worktreeCommand = branchExists 
      ? `git worktree add "${worktreePath}" ${branchName}`
      : `git worktree add -b ${branchName} "${worktreePath}" ${resolvedBaseBranch}`;
    console.log(`Creating worktree with command: ${worktreeCommand} (branch exists: ${branchExists})`);
    console.log(`Worktree path: ${worktreePath}, Parent dir: ${parentDir}, WORKTREE_ROOT: ${WORKTREE_ROOT}`);
    console.log(`Using container paths: ROOT_DIR=${ROOT_DIR}, HOST_ROOT_DIR=${HOST_ROOT_DIR}`);
    try {
      // Ensure we're using container paths for git operations
      const result = await execAsync(worktreeCommand, {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      console.log(`Git command output: ${result.stdout}`);
      console.log(`Successfully created worktree at ${worktreePath}`);
      
      // Verify the worktree was created with correct paths
      const { stdout: worktreeListAfter } = await execAsync('git worktree list', { cwd: repoPath });
      console.log(`Worktree list after creation:\n${worktreeListAfter}`);
      
      // Fix the .git file if it points to a host path instead of container path
      const gitFile = path.join(worktreePath, '.git');
      if (existsSync(gitFile)) {
        try {
          const gitContent = readFileSync(gitFile, 'utf-8').trim();
          // If the .git file points to a host path, fix it to use container path
          if (gitContent.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
            const fixedContent = gitContent.replace(HOST_ROOT_DIR, ROOT_DIR);
            writeFileSync(gitFile, fixedContent + '\n', 'utf-8');
            console.log(`Fixed .git file path from host to container: ${gitFile}`);
            console.log(`  Old: ${gitContent}`);
            console.log(`  New: ${fixedContent}`);
          }
        } catch (error) {
          console.warn('Failed to fix .git file path:', error);
        }
      }
      
      // Verify git operations work in the worktree
      try {
        const { stdout: branchName } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreePath
        });
        console.log(`Verified worktree git repository: on branch ${branchName.trim()}`);
      } catch (error) {
        console.warn(`Warning: Could not verify git repository in worktree: ${error}`);
      }
      
      // Note: Branch is created locally only. User can push manually when ready.
      console.log(`Branch ${branchName} created locally. Push to remote when ready using: git push -u origin ${branchName}`);
    } catch (error: any) {
      // Capture the actual error message from git
      const errorMessage = error.stderr || error.stdout || error.message || 'Unknown error';
      console.error(`Failed to create worktree: ${errorMessage}`);
      console.error(`Full error object:`, error);
      return { 
        success: false, 
        error: `Failed to create worktree: ${errorMessage}` 
      };
    }
    
    // Fix .git file and worktree metadata paths
    // Note: We need to keep container paths for git operations, but may need host paths for .git file
    const gitFile = path.join(worktreePath, '.git');
    if (existsSync(gitFile)) {
      try {
        const gitContent = readFileSync(gitFile, 'utf-8').trim();
        // The .git file should point to the worktree's gitdir
        // Git stores the absolute path, which might be in host or container format
        let fixedContent = gitContent;
        
        // If git stored host path but we're in container, convert it
        if (ROOT_DIR !== HOST_ROOT_DIR && gitContent.includes(HOST_ROOT_DIR)) {
          // Keep host path for .git file (for VS Code compatibility when opened on host)
          // But we need to ensure the referenced gitdir exists at that path or we convert it
          console.log(`Git file uses host path: ${gitContent}`);
        } else if (ROOT_DIR !== HOST_ROOT_DIR && gitContent.includes(ROOT_DIR)) {
          // If it uses container path, we might want to convert to host for VS Code
          // But for now, keep container path for git operations to work
          console.log(`Git file uses container path: ${gitContent}`);
        }
        
        // Actually, let's ensure the .git file points to a path that exists
        // Extract the gitdir path from the .git file
        if (gitContent.startsWith('gitdir: ')) {
          const gitdirPath = gitContent.replace('gitdir: ', '').trim();
          // Check if the gitdir path exists (try both container and host paths)
          const containerGitdirPath = gitdirPath.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR
            ? gitdirPath.replace(HOST_ROOT_DIR, ROOT_DIR)
            : gitdirPath;
          
          if (!existsSync(containerGitdirPath)) {
            console.warn(`Gitdir path does not exist: ${containerGitdirPath}, git may have issues`);
          }
        }
      } catch (error) {
        console.warn('Failed to fix .git file path:', error);
      }
    }
    
    // Fix worktree metadata - ensure gitdir files use correct paths
    try {
      const worktreesDir = path.join(repoPath, '.git', 'worktrees');
      if (existsSync(worktreesDir)) {
        const entries = readdirSync(worktreesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const gitdirFile = path.join(worktreesDir, entry.name, 'gitdir');
            if (existsSync(gitdirFile)) {
              let gitdirContent = readFileSync(gitdirFile, 'utf-8').trim();
              const originalContent = gitdirContent;
              
              // Check if this gitdir corresponds to our worktree
              if (gitdirContent.includes(worktreePath) || gitdirContent.includes(branchName)) {
                // If gitdir uses host path but we need container path for git to work
                if (gitdirContent.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
                  const containerGitdirPath = gitdirContent.replace(HOST_ROOT_DIR, ROOT_DIR);
                  // Verify the container path exists
                  if (existsSync(containerGitdirPath)) {
                    gitdirContent = containerGitdirPath;
                  }
                }
                
                // Update the gitdir file if changed
                if (gitdirContent !== originalContent) {
                  writeFileSync(gitdirFile, gitdirContent + '\n', 'utf-8');
                  console.log(`Fixed gitdir file: ${gitdirFile} to use container path`);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to fix worktree metadata:', error);
    }
    
    // Verify the worktree is properly registered
    try {
      const { stdout: worktreeList } = await execAsync('git worktree list', { cwd: repoPath });
      const worktreeLines = worktreeList.trim().split('\n');
      const worktreeFound = worktreeLines.some(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) return false;
        const wtPath = parts[0];
        // Check both container and host paths
        return wtPath === worktreePath || 
               wtPath === worktreePath.replace(ROOT_DIR, HOST_ROOT_DIR) ||
               wtPath.replace(HOST_ROOT_DIR, ROOT_DIR) === worktreePath;
      });
      
      if (!worktreeFound) {
        console.warn(`Worktree at ${worktreePath} not found in git worktree list`);
      } else {
        console.log(`Worktree successfully registered in git`);
      }
    } catch (error) {
      console.warn('Failed to verify worktree registration:', error);
    }
    
    return {
      success: true,
      worktree: {
        repo: repoKey, // Keep key for backward compatibility
        repoName: config.name, // Actual GitHub repo name
        type,
        name,
        branch: branchName,
        path: worktreePath
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create working tree' };
  }
}

export async function GET() {
  try {
    const worktrees: Array<{
      repo: string;
      repoName: string;
      type: string;
      name: string;
      branch: string;
      path: string;
      fullPath: string;
    }> = [];
    const worktreeSet = new Set<string>(); // Track worktrees by path to avoid duplicates
    
    // First, discover worktrees using git worktree list for each repository
    // This finds worktrees regardless of their location (old format, new format, etc.)
    for (const [repoKey, config] of Object.entries(REPO_MAP)) {
      const repoPath = path.join(ROOT_DIR, config.name);
      if (!existsSync(repoPath) || !existsSync(path.join(repoPath, '.git'))) {
        continue;
      }
      
      try {
        const { stdout } = await execAsync('git worktree list', { cwd: repoPath });
        const worktreeLines = stdout.trim().split('\n');
        
        for (const line of worktreeLines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 2) continue;
          
          const worktreePath = parts[0];
          // Skip the main repository path
          if (worktreePath === repoPath || worktreePath.replace(/\/$/, '') === repoPath.replace(/\/$/, '')) {
            continue;
          }
          
          // Skip prunable worktrees (directories don't exist)
          if (line.includes('prunable')) {
            continue;
          }
          
          // Normalize path for comparison (convert host path to container path if needed)
          const normalizePath = (p: string) => {
            let normalized = p.replace(/\/$/, '');
            if (normalized.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
              normalized = normalized.replace(HOST_ROOT_DIR, ROOT_DIR);
            }
            return normalized;
          };
          const normalizedPath = normalizePath(worktreePath);
          
          // Skip if we've already processed this worktree
          if (worktreeSet.has(normalizedPath)) {
            continue;
          }
          
          // Check if worktree directory exists
          const containerPath = worktreePath.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR
            ? worktreePath.replace(HOST_ROOT_DIR, ROOT_DIR)
            : worktreePath;
          
          if (!existsSync(containerPath)) {
            continue;
          }
          
          // Verify it's a worktree (has .git file, not directory)
          const gitFile = path.join(containerPath, '.git');
          if (!existsSync(gitFile)) {
            continue;
          }
          
          try {
            const stat = statSync(gitFile);
            if (stat.isDirectory()) {
              continue; // This is a main repo, not a worktree
            }
          } catch {
            continue;
          }
          
                    // Extract branch name from git worktree list output
          const branchMatch = line.match(/\[(.*?)\]/);
          if (!branchMatch) continue;
          const branchName = branchMatch[1];

          // Try to extract repo, type and name from branch name (format: repoName-type-name)
          // Branch name should start with repo name, then type, then name
          // Example: sideline-frontend-feat-test1 -> repo: sideline-frontend, type: feat, name: test1
          if (!branchName.startsWith(config.name + '-')) continue;
          
          // Remove repo name prefix to get type-name part
          const typeAndName = branchName.substring(config.name.length + 1);
          const typeAndNameParts = typeAndName.split('-');
          if (typeAndNameParts.length < 2) continue;
          
          const type = typeAndNameParts[0];
          if (!VALID_TYPES.includes(type)) continue;
          
          const name = typeAndNameParts.slice(1).join('-');
          
          // Get actual branch name from git to verify
          try {
            const { stdout: actualBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: containerPath });
            const actualBranchName = actualBranch.trim();
            
            worktreeSet.add(normalizedPath);
            worktrees.push({
              repo: repoKey,
              repoName: config.name,
              type: type,
              name: name,
              branch: actualBranchName,
              path: containerPath,
              fullPath: containerPath
            });
          } catch (error: any) {
            console.warn(`Failed to get branch name for ${containerPath}: ${error.message}`);
            // Use branch name from worktree list (which should match the directory name)
            // This is the actual branch name: {repoName}-{type}-{name}
            worktreeSet.add(normalizedPath);
            worktrees.push({
              repo: repoKey,
              repoName: config.name,
              type: type,
              name: name,
              branch: branchName, // Use branch name from worktree list output
              path: containerPath,
              fullPath: containerPath
            });
          }
        }
      } catch (error: any) {
        console.warn(`Failed to list worktrees for ${config.name}: ${error.message}`);
      }
    }
    
    // Also scan WORKTREE_ROOT for worktree directories (for backward compatibility and structure verification)
    // Structure: Tree/{repo}/{branchName}
    // Note: This is now secondary to git worktree list, but kept for structure verification
    if (existsSync(WORKTREE_ROOT)) {
      try {
      // Scan each repository directory in Tree
      const repoEntries = readdirSync(WORKTREE_ROOT, { withFileTypes: true });
      
      for (const repoEntry of repoEntries) {
        if (!repoEntry.isDirectory()) continue;
        
        const repoDirName = repoEntry.name;
        const repoDirPath = path.join(WORKTREE_ROOT, repoDirName);
        
        // Check if this matches a known repository
        let matchedRepo: { key: string; config: { name: string; url: string } } | null = null;
        if (REPO_NAME_MAP[repoDirName]) {
          matchedRepo = REPO_NAME_MAP[repoDirName];
        } else {
          // Try to find by matching config name
          for (const [key, config] of Object.entries(REPO_MAP)) {
            if (config.name === repoDirName) {
              matchedRepo = { key, config };
              break;
            }
          }
        }
        
        if (!matchedRepo) continue;
        
        // Scan branch directories directly (branch name format: {type}-{name})
        try {
          const branchEntries = readdirSync(repoDirPath, { withFileTypes: true });
          
          for (const branchEntry of branchEntries) {
            if (!branchEntry.isDirectory()) continue;
            
            const branchName = branchEntry.name;
            const worktreePath = path.join(repoDirPath, branchName);
            
                         // Extract repo, type and name from branch name (format: repoName-type-name)
             // Branch name should start with repo name, then type, then name
             // Example: sideline-frontend-feat-test1 -> repo: sideline-frontend, type: feat, name: test1
             if (!branchName.startsWith(matchedRepo.config.name + '-')) continue;
             
             // Remove repo name prefix to get type-name part
             const branchTypeAndName = branchName.substring(matchedRepo.config.name.length + 1);
             const branchTypeAndNameParts = branchTypeAndName.split('-');
             if (branchTypeAndNameParts.length < 2) continue;
             
             const type = branchTypeAndNameParts[0];
             if (!VALID_TYPES.includes(type)) continue;
             
             const gitFile = path.join(worktreePath, '.git');
                
                // Skip if it's not a worktree (no .git file)
                if (!existsSync(gitFile)) continue;
                
                // Verify it's a .git file, not a directory
                try {
                  const stat = statSync(gitFile);
                  if (stat.isDirectory()) {
                    continue; // This is a main repo, not a worktree
                  }
                } catch {
                  continue;
                }
                
                // Extract name from branch (branchName is {repoName}-{type}-{name})
                // Remove repo name prefix to get type-name part
                if (!branchName.startsWith(matchedRepo.config.name + '-')) continue;
                const fsTypeAndName = branchName.substring(matchedRepo.config.name.length + 1);
                const fsTypeAndNameParts = fsTypeAndName.split('-');
                if (fsTypeAndNameParts.length < 2) continue;
                const name = fsTypeAndNameParts.slice(1).join('-'); // Everything after type-
                
                const repoPath = path.join(ROOT_DIR, matchedRepo.config.name);
                if (!existsSync(repoPath)) continue;
                
                // Fix .git file path if needed (for VS Code compatibility)
                let gitFileNeedsFixing = false;
                let originalGitContent = '';
                
                if (ROOT_DIR !== HOST_ROOT_DIR) {
                  try {
                    const gitContent = readFileSync(gitFile, 'utf-8').trim();
                    if (gitContent.includes(HOST_ROOT_DIR)) {
                      originalGitContent = gitContent;
                      const containerGitContent = gitContent.replace(
                        new RegExp(HOST_ROOT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                        ROOT_DIR
                      );
                      writeFileSync(gitFile, containerGitContent + '\n', 'utf-8');
                      gitFileNeedsFixing = true;
                    } else if (gitContent.includes(ROOT_DIR)) {
                      const fixedContent = gitContent.replace(
                        new RegExp(ROOT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                        HOST_ROOT_DIR
                      );
                      if (fixedContent !== gitContent) {
                        writeFileSync(gitFile, fixedContent + '\n', 'utf-8');
                      }
                    }
                  } catch (error) {
                    console.warn(`Failed to fix .git file for ${worktreePath}:`, error);
                  }
                }
                
                // Get the actual branch name from git
                let actualBranchName = '';
                try {
                  const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath });
                  actualBranchName = stdout.trim();
                } catch (error: any) {
                  console.warn(`Failed to get branch name for ${worktreePath}: ${error.message}`);
                  // Use the directory name as the branch name (should match: {repoName}-{type}-{name})
                  actualBranchName = branchName;
                  if (gitFileNeedsFixing && originalGitContent) {
                    try {
                      writeFileSync(gitFile, originalGitContent + '\n', 'utf-8');
                    } catch {
                      // Ignore
                    }
                  }
                  // Don't continue - use the directory name as branch name
                }
                
                // Restore .git file if needed
                if (gitFileNeedsFixing && originalGitContent) {
                  try {
                    writeFileSync(gitFile, originalGitContent + '\n', 'utf-8');
                  } catch {
                    // Ignore
                  }
                }
                
                // Skip if already added from git worktree list scan
                const normalizePath = (p: string) => {
                  let normalized = p.replace(/\/$/, '');
                  if (normalized.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
                    normalized = normalized.replace(HOST_ROOT_DIR, ROOT_DIR);
                  }
                  return normalized;
                };
                const normalizedWorktreePath = normalizePath(worktreePath);
                
                if (!worktreeSet.has(normalizedWorktreePath)) {
                  worktreeSet.add(normalizedWorktreePath);
                  worktrees.push({
                    repo: matchedRepo.key,
                    repoName: matchedRepo.config.name,
                    type: type,
                    name: name,
                    branch: actualBranchName,
                    path: worktreePath,
                    fullPath: worktreePath
                  });
                }
              }
            } catch (err) {
              // Skip if can't read repo directory
              console.warn(`Failed to read repo directory ${repoDirPath}:`, err);
            }
      }
      } catch (err) {
        // Skip if can't read WORKTREE_ROOT
        console.warn('Failed to read WORKTREE_ROOT:', err);
      }
    }
    
    return NextResponse.json({ worktrees });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch worktrees' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repo, repos, type, name } = body;
    
    // Support both single repo (backward compatibility) and multiple repos
    const reposToProcess: string[] = repos || (repo ? [repo] : []);
    
    // Validate inputs
    if (reposToProcess.length === 0 || !type || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: repos (or repo), type, name' },
        { status: 400 }
      );
    }
    
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate all repos exist (by name or key for backward compatibility)
    for (const repoIdentifier of reposToProcess) {
      if (!REPO_NAME_MAP[repoIdentifier] && !REPO_MAP[repoIdentifier]) {
        return NextResponse.json(
          { error: `Invalid repository: ${repoIdentifier}` },
          { status: 400 }
        );
      }
    }
    
    // Create worktrees for all selected repos
    const results = [];
    const errors = [];
    
    // Extract baseBranches from request body (map of repo -> baseBranch)
    const baseBranches = (body as any)?.baseBranches || {};
    
    for (const repoIdentifier of reposToProcess) {
      const repoBaseBranch = baseBranches[repoIdentifier];
      const result = await createWorktreeForRepo(repoIdentifier, type, name, repoBaseBranch);
      
      if (result.success && result.worktree) {
        results.push(result.worktree);
      } else {
        errors.push({
          repo: repoIdentifier,
          error: result.error || 'Unknown error'
        });
      }
    }
    
    // Return results
    if (results.length === 0) {
      // All failed - include detailed error messages
      const errorMessages = errors.map(e => `${e.repo}: ${e.error}`).join('; ');
      return NextResponse.json(
        { 
          error: `Failed to create worktrees in all repositories: ${errorMessages}`,
          errors 
        },
        { status: 500 }
      );
    }
    
    // Create GitHub Projects backlog items for successful worktrees
    try {
      const githubOrg = process.env.GITHUB_ORG || 'AutoRemediation';
      const project = await findOrCreateWorkspaceProject(githubOrg);
      const backlogColumnId = await getOrCreateBacklogColumn(project.id);
      
      for (const worktree of results) {
        const title = `${worktree.repoName}: ${worktree.type}-${worktree.name}`;
        const body = `Repository: ${worktree.repoName}\nBranch: ${worktree.branch}\nType: ${worktree.type}\nName: ${worktree.name}\nPath: ${worktree.path}`;
        
        try {
          await createDraftIssue(project.id, backlogColumnId, title, body);
        } catch (projectError: any) {
          console.warn(`Failed to create project item for worktree ${worktree.branch}:`, projectError.message);
          // Don't fail the entire request if project item creation fails
        }
      }
    } catch (projectError: any) {
      console.warn('Failed to create GitHub Projects items:', projectError.message);
      // Don't fail the entire request if project integration fails
    }
    
    return NextResponse.json({
      success: true,
      message: `Created ${results.length} working tree${results.length > 1 ? 's' : ''} successfully`,
      worktrees: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create working trees' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { repo, type, name, path: worktreePath } = body;
    
    // Validate inputs
    if (!repo || !type || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: repo, type, name' },
        { status: 400 }
      );
    }
    
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Support both repo key and repo name for backward compatibility
    let repoKey: string | undefined;
    let config: { name: string; url: string } | undefined;
    
    if (REPO_NAME_MAP[repo]) {
      repoKey = REPO_NAME_MAP[repo].key;
      config = REPO_NAME_MAP[repo].config;
    } else if (REPO_MAP[repo]) {
      repoKey = repo;
      config = REPO_MAP[repo];
    } else {
      return NextResponse.json(
        { error: `Invalid repository: ${repo}` },
        { status: 400 }
      );
    }
    
    const repoPath = path.join(ROOT_DIR, config.name);
    const branchName = `${config.name}-${type}-${name}`;
    // Worktrees are organized in Tree/{repo}/{branchName} where branchName includes repo prefix
    const fullWorktreePath = worktreePath || path.join(WORKTREE_ROOT, config.name, branchName);
    
    // Check if worktree directory exists
    if (!existsSync(fullWorktreePath)) {
      return NextResponse.json(
        { error: `Working tree not found at ${fullWorktreePath}` },
        { status: 404 }
      );
    }
    
    // Check if repo exists
    if (!existsSync(repoPath) || !existsSync(path.join(repoPath, '.git'))) {
      return NextResponse.json(
        { error: `Repository not found at ${repoPath}` },
        { status: 404 }
      );
    }
    
    // Remove git worktree
    try {
      await execAsync(`git worktree remove "${fullWorktreePath}" --force`, {
        cwd: repoPath
      });
    } catch (error: any) {
      // If worktree remove fails, try to remove the directory anyway
      // This handles cases where the worktree might be in an inconsistent state
      console.warn(`Failed to remove worktree via git: ${error.message}`);
    }
    
    // Remove the directory if it still exists
    if (existsSync(fullWorktreePath)) {
      try {
        rmSync(fullWorktreePath, { recursive: true, force: true });
      } catch (error: any) {
        return NextResponse.json(
          { error: `Failed to remove directory: ${error.message}` },
          { status: 500 }
        );
      }
    }
    
    // Delete associated GitHub Projects card if it exists
    try {
      const githubOrg = process.env.GITHUB_ORG || 'AutoRemediation';
      const project = await findOrCreateWorkspaceProject(githubOrg);
      const projectItem = await findProjectItemByWorktree(project.id, config.name, branchName);
      
      if (projectItem) {
        try {
          await deleteProjectItem(projectItem.id);
          console.log(`Deleted project card for worktree ${branchName}`);
        } catch (deleteError: any) {
          console.warn(`Failed to delete project card: ${deleteError.message}`);
          // Don't fail the request if project card deletion fails
        }
      }
    } catch (projectError: any) {
      console.warn('Failed to delete GitHub Projects item:', projectError.message);
      // Don't fail the request if project integration fails
    }
    
    // Optionally remove the branch (uncomment if desired)
    // try {
    //   await execAsync(`git branch -D ${branchName}`, { cwd: repoPath });
    // } catch {
    //   // Ignore if branch doesn't exist or can't be deleted
    // }
    
    return NextResponse.json({
      success: true,
      message: 'Working tree deleted successfully'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete working tree' },
      { status: 500 }
    );
  }
}
