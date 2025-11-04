# Git Working Tree Manager

A Next.js web application for managing Git working trees across multiple repositories. Perfect for parallel development workflows with multiple AI agents or team members.

## Features

- 🎯 **Interactive UI**: Clean, modern interface for creating and managing working trees
- 📦 **Multi-Repository Support**: Manage working trees for frontend, backend, and viewer repositories
- 🌿 **Branch Management**: Automatically creates branches from dev and organizes them by type (feat, bugs, fixes)
- 🐳 **Dockerized**: Easy deployment in any environment with Docker
- ⚡ **Real-time Status**: View all existing working trees at a glance

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
- `GITHUB_TOKEN`: GitHub personal access token for cloning repositories

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

1. **Select Repository**: Choose which repository you want to create a working tree for
2. **Choose Branch Type**: Select from "New Feature", "Bug Fix", or "Fix"
3. **Enter Branch Name**: Provide a descriptive name (e.g., `login-button`, `auth-fix`)
4. **Create**: Click "Create Working Tree" to generate the isolated working tree

The working tree will be created in the format: `{repo}/{type}/{name}/`

## API Endpoints

- `GET /api/repos` - List all configured repositories
- `GET /api/worktrees` - List all existing working trees
- `POST /api/worktrees` - Create a new working tree
  ```json
  {
    "repo": "frontend",
    "type": "feat",
    "name": "login-button"
  }
  ```

## Troubleshooting

### Permission Issues

If you encounter permission errors, ensure the Docker container has write access to the mounted volumes:

```bash
# Fix permissions (adjust user/group as needed)
sudo chown -R $USER:$USER /path/to/repos
```

### GitHub Token Issues

Make sure your GitHub token has the necessary permissions:
- `repo` scope (for private repositories)
- `read:org` scope (if repositories are in an organization)

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
│   │   │   └── route.ts      # Repository listing API
│   │   └── worktrees/
│   │       └── route.ts      # Working tree management API
│   └── page.tsx               # Main UI component
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

MIT
