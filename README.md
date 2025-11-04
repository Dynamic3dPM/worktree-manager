# Git Working Tree Manager

A Next.js web application for managing Git working trees across multiple repositories. Perfect for parallel development workflows with multiple AI agents or team members.

## Features

- 🎯 **Interactive UI**: Clean, modern interface for creating and managing working trees
- 📦 **Multi-Repository Support**: Manage working trees for frontend, backend, and viewer repositories
- 🌿 **Branch Management**: Automatically creates branches from dev and organizes them by type (feat, bugs, fixes)
- 🐳 **Dockerized**: Easy deployment in any environment with Docker
- ⚡ **Real-time Status**: View all existing working trees at a glance
- 📊 **GitHub Projects Integration**: Kanban board view with automatic backlog item creation
- 🔄 **Drag-and-Drop**: Move items between columns to track work progress

## Quick Start

### Using Docker Compose

1. **Set up your GitHub token** (create a `.env` file or export it):
   ```bash
   export GITHUB_TOKEN=your_github_token_here
   ```

2. **Build and run**:
   ```bash
   docker-compose up -d
   ```

3. **Access the UI**:
   Open http://localhost:3000 in your browser

### Development Mode

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set environment variables**:
   ```bash
   export REPO_ROOT=/path/to/your/repos
   export GITHUB_TOKEN=your_github_token_here
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

- `REPO_ROOT`: Root directory where repositories are located (default: `/repos`)
- `HOST_REPO_ROOT`: Host path for repositories (default: same as `REPO_ROOT`)
- `GITHUB_TOKEN`: GitHub personal access token for cloning repositories and managing projects
- `GITHUB_ORG`: GitHub organization name (default: `AutoRemediation`)
- `GITHUB_PROJECT_NAME`: Name for the workspace project (default: `Worktree Manager Project`)
- `FRONTEND_REPO`, `BACKEND_REPO`, `VIEWER_REPO`: Repository names (defaults: `sideline-frontend`, `sideline-backend`, `ohif-viewer`)

### Repository Configuration

The app is pre-configured for:
- `sideline-frontend` (frontend)
- `ohif-viewer` (viewer)
- `sideline-backend` (backend)

To modify repositories, edit `app/api/repos/route.ts` and `app/api/worktrees/route.ts`.

## Docker Volume Mounting

The docker-compose.yml mounts the parent directory (`../`) to `/repos` so the container can access all repositories. You can customize this by:

1. Mounting specific repositories:
   ```yaml
   volumes:
     - ../sideline-frontend:/repos/sideline-frontend:rw
     - ../ohif-viewer:/repos/ohif-viewer:rw
     - ../sideline-backend:/repos/sideline-backend:rw
   ```

2. Or mounting from a different location:
   ```yaml
   volumes:
     - /path/to/repos:/repos:rw
   ```

## Usage

### Creating Working Trees

1. **Select Repository**: Choose which repository you want to create a working tree for (multiple selection supported)
2. **Choose Branch Type**: Select from "New Feature", "Bug Fix", or "Fix"
3. **Enter Branch Name**: Provide a descriptive name (e.g., `login-button`, `auth-fix`)
4. **Create**: Click "Create Working Tree" to generate the isolated working tree

The working tree will be created in the format: `{repoName}-{type}-{name}/`

### GitHub Projects Kanban Board

1. Navigate to the **Projects** page from the sidebar
2. View all worktree-related backlog items in a Kanban board
3. Drag and drop items between columns to track progress
4. When you create a worktree, a backlog item is automatically added to the project

**Note**: The project is automatically created on first use if it doesn't exist.

## API Endpoints

### Worktrees
- `GET /api/repos` - List all configured repositories
- `GET /api/worktrees` - List all existing working trees
- `POST /api/worktrees` - Create a new working tree
  ```json
  {
    "repos": ["frontend", "backend"],
    "type": "feat",
    "name": "login-button"
  }
  ```
- `DELETE /api/worktrees` - Delete a working tree

### Projects
- `GET /api/projects` - List all organization projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/[projectId]` - Get project details with columns and items
- `POST /api/projects/[projectId]/items` - Create a backlog item
- `PATCH /api/projects/[projectId]/items` - Update or move a project item

## Troubleshooting

### Permission Issues

If you encounter permission errors, ensure the Docker container has write access to the mounted volumes:

```bash
# Fix permissions (adjust user/group as needed)
sudo chown -R $USER:$USER /path/to/repos
```

### GitHub Token Issues

Make sure your GitHub token has the necessary permissions:

**For Classic Personal Access Tokens:**
- `repo` scope (for private repositories and cloning)
- `read:org` scope (if repositories are in an organization)
- `project` scope (read & write) for GitHub Projects API

**For Fine-Grained Personal Access Tokens:**
- Repository access: Select the repositories you want to manage
- Repository permissions: `Contents` (read), `Metadata` (read)
- Organization permissions: `Projects` (read & write)

**Note**: The token must have Projects permissions to create and manage the Kanban board. Without this, worktree creation will still work, but project items won't be created.

### Repository Not Found

If repositories don't appear:
1. Ensure they exist in the `REPO_ROOT` directory
2. Check that they are valid Git repositories (have a `.git` directory)
3. Verify the repository names match the configuration

## Development

### Project Structure

```
worktree-manager/
├── app/
│   ├── api/
│   │   ├── repos/
│   │   │   └── route.ts           # Repository listing API
│   │   ├── worktrees/
│   │   │   └── route.ts           # Working tree management API
│   │   └── projects/
│   │       ├── route.ts           # Projects listing/creation API
│   │       └── [projectId]/
│   │           ├── route.ts       # Project details API
│   │           └── items/
│   │               └── route.ts   # Project items API
│   ├── components/
│   │   └── Sidebar.tsx            # Navigation sidebar
│   ├── lib/
│   │   └── github-projects.ts     # GitHub Projects API client
│   ├── projects/
│   │   └── page.tsx               # Projects/Kanban board page
│   ├── layout.tsx                 # Root layout with sidebar
│   └── page.tsx                   # Main worktrees UI
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

MIT
