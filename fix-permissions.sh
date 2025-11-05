#!/bin/bash
# Script to fix permissions on repos directory
# Run this after creating worktrees if you encounter permission issues

REPOS_DIR="/home/tim-175/repos"
USER_ID=1020
GROUP_ID=1020

echo "Fixing permissions on $REPOS_DIR..."
sudo chown -R $USER_ID:$GROUP_ID "$REPOS_DIR"
sudo chmod -R u+rwX,g+rwX,o+rX "$REPOS_DIR"

# Make .git directories writable (needed for worktree operations)
echo "Making .git directories writable..."
find "$REPOS_DIR" -type d -name ".git" -exec sudo chmod -R u+rwX,g+rwX,o+rX {} \;
find "$REPOS_DIR" -type d -name "refs" -exec sudo chmod -R u+rwX,g+rwX,o+rX {} \;

# Make Tree directory writable
if [ -d "$REPOS_DIR/Tree" ]; then
    sudo chmod -R u+rwX,g+rwX,o+rX "$REPOS_DIR/Tree"
fi

echo "✅ Permissions fixed!"
echo ""
echo "Current ownership:"
ls -la "$REPOS_DIR" | head -5
echo ""
echo "⚠️  Note: For a permanent fix, rebuild the container with:"
echo "   docker-compose down"
echo "   docker-compose build --no-cache"
echo "   docker-compose up -d"

