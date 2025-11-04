import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

const VALID_TYPES = ['feat', 'bugs', 'fixes'];
const ROOT_DIR = process.env.REPO_ROOT || '/repos';
const HOST_ROOT_DIR = process.env.HOST_REPO_ROOT || ROOT_DIR;

export async function GET() {
  try {
    const worktrees = [];
    
    for (const [key, config] of Object.entries(REPO_MAP)) {
      const repoPath = path.join(ROOT_DIR, config.name);
      
      if (!existsSync(repoPath)) continue;
      
      // Check each type directory
      for (const type of VALID_TYPES) {
        const typePath = path.join(repoPath, type);
        if (!existsSync(typePath)) continue;
        
        try {
          const entries = readdirSync(typePath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const worktreePath = path.join(typePath, entry.name);
              
              // Fix .git file path if it uses container paths (for VS Code compatibility)
              const gitFile = path.join(worktreePath, '.git');
              let gitFileNeedsFixing = false;
              let originalGitContent = '';
              
              if (existsSync(gitFile) && ROOT_DIR !== HOST_ROOT_DIR) {
                try {
                  const gitContent = readFileSync(gitFile, 'utf-8').trim();
                  if (gitContent.includes(HOST_ROOT_DIR)) {
                    // Temporarily fix .git file to use container paths for git commands
                    originalGitContent = gitContent;
                    const containerGitContent = gitContent.replace(
                      new RegExp(HOST_ROOT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                      ROOT_DIR
                    );
                    writeFileSync(gitFile, containerGitContent + '\n', 'utf-8');
                    gitFileNeedsFixing = true;
                  } else if (gitContent.includes(ROOT_DIR)) {
                    // Fix container paths to host paths for VS Code
                    const fixedContent = gitContent.replace(
                      new RegExp(ROOT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                      HOST_ROOT_DIR
                    );
                    if (fixedContent !== gitContent) {
                      writeFileSync(gitFile, fixedContent + '\n', 'utf-8');
                    }
                  }
                } catch (error) {
                  // Log but don't fail if we can't fix the .git file
                  console.warn(`Failed to fix .git file for ${worktreePath}:`, error);
                }
              }
              
              // Get the actual branch name from git
              let branchName = '';
              try {
                const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath });
                branchName = stdout.trim();
              } catch (error: any) {
                console.warn(`Failed to get branch name for ${worktreePath}: ${error.message}`);
                // Restore original .git file content if we changed it
                if (gitFileNeedsFixing && originalGitContent) {
                  try {
                    writeFileSync(gitFile, originalGitContent + '\n', 'utf-8');
                  } catch {
                    // Ignore
                  }
                }
                continue; // Skip this worktree if we can't get branch name
              }
              
              // Restore .git file to host path for VS Code compatibility
              if (gitFileNeedsFixing && originalGitContent) {
                try {
                  writeFileSync(gitFile, originalGitContent + '\n', 'utf-8');
                } catch {
                  // Ignore
                }
              }
              
              // Also fix the worktree metadata in .git/worktrees
              try {
                const worktreesDir = path.join(repoPath, '.git', 'worktrees');
                if (existsSync(worktreesDir)) {
                  const entries = readdirSync(worktreesDir, { withFileTypes: true });
                  for (const wtEntry of entries) {
                    if (wtEntry.isDirectory()) {
                      const gitdirFile = path.join(worktreesDir, wtEntry.name, 'gitdir');
                      if (existsSync(gitdirFile)) {
                        const gitdirContent = readFileSync(gitdirFile, 'utf-8').trim();
                        if (gitdirContent.includes(ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
                          const fixedContent = gitdirContent.replace(
                            new RegExp(ROOT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                            HOST_ROOT_DIR
                          );
                          if (fixedContent !== gitdirContent) {
                            writeFileSync(gitdirFile, fixedContent + '\n', 'utf-8');
                          }
                        }
                      }
                    }
                  }
                }
              } catch (error) {
                console.warn('Failed to fix worktree metadata:', error);
              }
              
              worktrees.push({
                repo: key,
                repoName: config.name,
                type,
                name: entry.name,
                branch: branchName,
                path: worktreePath,
                fullPath: worktreePath
              });
            }
          }
        } catch (err) {
          // Skip if can't read directory
        }
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
    const { repo, type, name } = body;
    
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
    
    if (!REPO_MAP[repo]) {
      return NextResponse.json(
        { error: `Invalid repository: ${repo}` },
        { status: 400 }
      );
    }
    
    const config = REPO_MAP[repo];
    const repoPath = path.join(ROOT_DIR, config.name);
    const branchName = `${type}-${name}`; // e.g., feat-test
    const worktreeFolderName = `${config.name}-${type}-${name}`; // e.g., sideline-frontend-feat-test
    const worktreePath = path.join(repoPath, type, worktreeFolderName); // e.g., /repos/sideline-frontend/feat/sideline-frontend-feat-test
    
    // Check if repo exists, if not clone it
    if (!existsSync(repoPath) || !existsSync(path.join(repoPath, '.git'))) {
      // Clone repository
      let token = process.env.GITHUB_TOKEN;
      
      // If token not in env, try to read from file
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
      
      if (!token) {
        return NextResponse.json(
          { error: 'GITHUB_TOKEN not found. Please set GITHUB_TOKEN environment variable or create a token file (.github-token, token, or GITHUB_TOKEN) in the root directory.' },
          { status: 500 }
        );
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
      
      // Try to checkout dev branch
      try {
        await execAsync('git checkout dev', { cwd: repoPath });
        await execAsync('git pull origin dev', { cwd: repoPath }).catch(() => {
          // Ignore if pull fails
        });
      } catch {
        // Try to create dev from origin/dev
        try {
          await execAsync('git checkout -b dev origin/dev', { cwd: repoPath });
        } catch {
          // Try main or master
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
    
    // Check if branch already exists (but don't check it out in main repo)
    // We'll let git worktree add handle branch creation if needed
    let branchExists = false;
    try {
      await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
        cwd: repoPath
      });
      branchExists = true;
    } catch {
      // Branch doesn't exist yet - git worktree add will create it
      branchExists = false;
    }
    
    // Create type directory if it doesn't exist
    const typePath = path.join(repoPath, type);
    if (!existsSync(typePath)) {
      await execAsync(`mkdir -p "${typePath}"`, { cwd: ROOT_DIR });
    }
    
    // Check if worktree already exists at the target path
    // Only remove if it's actually at our exact target path
    if (existsSync(worktreePath)) {
      console.log(`Worktree directory already exists at ${worktreePath}, checking if it's registered with git...`);
      // Check if this path is registered as a worktree in git
      try {
        const { stdout } = await execAsync('git worktree list', { cwd: repoPath });
        const worktreeLines = stdout.trim().split('\n');
        let isRegistered = false;
        let existingBranch = '';
        
        // Normalize paths for comparison
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
          // Only remove if it's using the same branch we want to create
          if (existingBranch === branchName) {
            console.log(`Removing existing worktree at ${worktreePath} (same branch ${branchName})`);
            try {
              await execAsync(`git worktree remove "${worktreePath}" --force`, {
                cwd: repoPath
              });
              // Wait a bit to ensure cleanup completes
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error: any) {
              console.warn(`Failed to remove worktree via git: ${error.message}`);
              // Try manual cleanup
              try {
                rmSync(worktreePath, { recursive: true, force: true });
              } catch (rmError: any) {
                return NextResponse.json(
                  { error: `Failed to remove existing worktree: ${rmError.message}` },
                  { status: 400 }
                );
              }
            }
          } else {
            // Different branch - we shouldn't remove it, but the folder exists
            // This shouldn't happen with our naming scheme, but handle it gracefully
            console.log(`Worktree at ${worktreePath} uses different branch ${existingBranch}, not removing`);
            return NextResponse.json(
              { error: `A worktree already exists at ${worktreePath} with a different branch (${existingBranch}). Please use a different name.` },
              { status: 400 }
            );
          }
        } else {
          // Folder exists but not registered - remove it manually
          console.log(`Directory exists at ${worktreePath} but is not a registered worktree, removing...`);
          try {
            rmSync(worktreePath, { recursive: true, force: true });
          } catch (error: any) {
            return NextResponse.json(
              { error: `Directory exists at ${worktreePath} and could not be removed: ${error.message}` },
              { status: 400 }
            );
          }
        }
      } catch (error: any) {
        // If we can't check, try to remove the directory anyway
        console.warn(`Failed to check worktree list: ${error.message}, removing directory...`);
        try {
          rmSync(worktreePath, { recursive: true, force: true });
        } catch (rmError: any) {
          return NextResponse.json(
            { error: `Directory exists at ${worktreePath} and could not be removed: ${rmError.message}` },
            { status: 400 }
          );
        }
      }
    }
    
    // Check if branch is already used by another worktree or checked out in main repo
    try {
      // First check what branch is currently checked out in the main repo
      try {
        const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
        const currentBranchName = currentBranch.trim();
        if (currentBranchName === branchName) {
          // Switch to dev branch if we're on the branch we want to create a worktree for
          try {
            await execAsync('git checkout dev', { cwd: repoPath }).catch(async () => {
              // Try main or master if dev doesn't exist
              await execAsync('git checkout main', { cwd: repoPath }).catch(async () => {
                await execAsync('git checkout master', { cwd: repoPath });
              });
            });
          } catch {
            // If we can't switch, we'll handle it in the worktree list check below
          }
        }
      } catch {
        // Continue if we can't check current branch
      }

      // Check if branch is used by any worktree at a DIFFERENT path
      // Only remove if it's at a different path (same branch, different location)
      const { stdout } = await execAsync('git worktree list', { cwd: repoPath });
      const worktreeLines = stdout.trim().split('\n');
      
      // Normalize paths for comparison (convert both to container paths)
      const normalizePathForComparison = (p: string) => {
        let normalized = p.replace(/\/$/, '');
        if (normalized.includes(HOST_ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
          normalized = normalized.replace(HOST_ROOT_DIR, ROOT_DIR);
        }
        return normalized;
      };
      const normalizedTargetPath = normalizePathForComparison(worktreePath);
      
      for (const line of worktreeLines) {
        // Parse worktree list format: "path [branch]" or "path (bare)" or "path (detached HEAD abc123)"
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        
        const existingPath = parts[0];
        const branchInfo = line.match(/\[(.*?)\]/);
        
        if (branchInfo && branchInfo[1] === branchName) {
          // If it's the main repo directory, just switch branches (already handled above)
          if (existingPath === repoPath || existingPath.replace(/\/$/, '') === repoPath.replace(/\/$/, '')) {
            // Already handled above by switching branches
            continue;
          }
          
          // Only remove if it's at a DIFFERENT path than our target
          const normalizedExistingPath = normalizePathForComparison(existingPath);
          if (normalizedExistingPath !== normalizedTargetPath) {
            // Different path, same branch - this shouldn't happen with our naming, but handle it
            console.log(`Removing conflicting worktree at ${existingPath} (same branch ${branchName}, different path)`);
            if (existsSync(existingPath)) {
              try {
                await execAsync(`git worktree remove "${existingPath}" --force`, {
                  cwd: repoPath
                });
                // Wait a bit to ensure cleanup completes
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (error: any) {
                console.warn(`Failed to remove conflicting worktree: ${error.message}`);
                // Don't fail - try to continue
              }
            }
          } else {
            // Same path - already handled above, skip
            console.log(`Worktree with branch ${branchName} already exists at target path, will be replaced`);
          }
        }
      }
    } catch (error) {
      // If git worktree list fails, continue anyway
      console.warn('Failed to list worktrees:', error);
    }
    
    // DON'T prune worktrees here - it can remove valid worktree metadata
    // Only prune if we explicitly need to clean up after a removal
    // Pruning here can cause issues with valid worktrees
    
    // Ensure we're not on the branch we're trying to create a worktree for
    try {
      const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
      const currentBranchName = currentBranch.trim();
      if (currentBranchName === branchName) {
        // Switch to dev, main, or master
        try {
          await execAsync('git checkout dev', { cwd: repoPath }).catch(async () => {
            await execAsync('git checkout main', { cwd: repoPath }).catch(async () => {
              await execAsync('git checkout master', { cwd: repoPath });
            });
          });
        } catch {
          // If we can't switch, the worktree add will fail with a clear error
        }
      }
    } catch {
      // Continue if we can't check current branch
    }
    
    // Create working tree
    // Use -b flag to create branch if it doesn't exist, otherwise just use the branch name
    const worktreeCommand = branchExists 
      ? `git worktree add "${worktreePath}" ${branchName}`
      : `git worktree add -b ${branchName} "${worktreePath}"`;
    console.log(`Creating worktree with command: ${worktreeCommand} (branch exists: ${branchExists})`);
    await execAsync(worktreeCommand, {
      cwd: repoPath
    });
    console.log(`Successfully created worktree at ${worktreePath}`);
    
    // Fix .git file path to use host path for VS Code compatibility
    // Replace container path (/repos) with host path in the .git file
    const gitFile = path.join(worktreePath, '.git');
    if (existsSync(gitFile) && ROOT_DIR !== HOST_ROOT_DIR) {
      try {
        const gitContent = readFileSync(gitFile, 'utf-8').trim();
        // Replace container paths with host paths
        const fixedContent = gitContent.replace(
          new RegExp(ROOT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          HOST_ROOT_DIR
        );
        if (fixedContent !== gitContent) {
          writeFileSync(gitFile, fixedContent + '\n', 'utf-8');
          console.log(`Fixed .git file: ${gitFile} (${ROOT_DIR} -> ${HOST_ROOT_DIR})`);
        }
      } catch (error) {
        // Log but don't fail if we can't fix the .git file
        console.warn('Failed to fix .git file path:', error);
      }
    }
    
    // Also fix the worktree metadata file (gitdir) in .git/worktrees
    // Find the worktree entry that matches this branch/worktree
    try {
      const worktreesDir = path.join(repoPath, '.git', 'worktrees');
      if (existsSync(worktreesDir)) {
        const entries = readdirSync(worktreesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const gitdirFile = path.join(worktreesDir, entry.name, 'gitdir');
            if (existsSync(gitdirFile)) {
              const gitdirContent = readFileSync(gitdirFile, 'utf-8').trim();
              // Check if this gitdir file points to our worktree
              if (gitdirContent.includes(worktreePath) || gitdirContent.includes(branchName) || gitdirContent.includes(ROOT_DIR)) {
                if (gitdirContent.includes(ROOT_DIR) && ROOT_DIR !== HOST_ROOT_DIR) {
                  const fixedContent = gitdirContent.replace(
                    new RegExp(ROOT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                    HOST_ROOT_DIR
                  );
                  if (fixedContent !== gitdirContent) {
                    writeFileSync(gitdirFile, fixedContent + '\n', 'utf-8');
                    console.log(`Fixed gitdir file: ${gitdirFile} (${ROOT_DIR} -> ${HOST_ROOT_DIR})`);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to fix worktree metadata:', error);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Working tree created successfully',
      worktree: {
        repo,
        repoName: config.name,
        type,
        name,
        branch: branchName,
        path: worktreePath
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create working tree' },
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
    
    if (!REPO_MAP[repo]) {
      return NextResponse.json(
        { error: `Invalid repository: ${repo}` },
        { status: 400 }
      );
    }
    
    const config = REPO_MAP[repo];
    const repoPath = path.join(ROOT_DIR, config.name);
    const branchName = `${type}/${name}`;
    const fullWorktreePath = worktreePath || path.join(repoPath, type, name);
    
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
