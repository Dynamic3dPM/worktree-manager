# Database Migrations

This directory contains SQL migration files for setting up the Supabase database schema.

## Migration Order

1. `001_initial_schema.sql` - Creates all tables, indexes, RLS policies, and triggers
2. `002_encryption_functions.sql` - Creates encryption functions for GitHub tokens (optional)

## How to Apply Migrations

### Option 1: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `001_initial_schema.sql`
4. Run the migration
5. Repeat for `002_encryption_functions.sql` if needed

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Option 3: Using psql

```bash
psql -h your-db-host -U postgres -d postgres -f lib/supabase/migrations/001_initial_schema.sql
```

## Important Notes

- **RLS Policies**: All tables have Row Level Security enabled. Make sure your Supabase Auth is configured properly.
- **Encryption**: The encryption functions in `002_encryption_functions.sql` are optional. For production, consider using Supabase Vault for token encryption.
- **UUID Extension**: The migrations require the `uuid-ossp` and `pgcrypto` extensions to be available.

## Schema Overview

- `github_accounts` - Stores GitHub tokens per user
- `projects` - Projects created by users
- `project_members` - Access control (owner/editor/viewer roles)
- `project_repositories` - Many-to-many relationship between projects and repos
- `kanban_boards` - One board per project
- `kanban_items` - Items in Kanban boards
- `github_webhooks` - Webhook configurations

## Testing RLS Policies

After applying migrations, test that RLS policies work correctly:

```sql
-- Test as a specific user
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-uuid-here';

-- Try to select from projects (should only see accessible projects)
SELECT * FROM projects;
```

