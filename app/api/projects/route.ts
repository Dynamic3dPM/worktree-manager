import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get projects user has access to (owner or member)
    // RLS policies will filter automatically
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        github_account_id,
        created_at,
        updated_at,
        github_accounts (
          account_name,
          github_username
        ),
        project_members (
          user_id,
          role
        ),
        project_repositories (
          id,
          repository_full_name,
          github_account_id
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching projects:', error)
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: 500 }
      )
    }

    // Transform the data to include counts and simplify structure
    const projectsWithCounts = (projects || []).map((project: any) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      github_account_id: project.github_account_id,
      github_account: project.github_accounts ? {
        account_name: project.github_accounts.account_name,
        github_username: project.github_accounts.github_username,
      } : null,
      owner_id: project.owner_id,
      owner: project.owner ? {
        id: project.owner.id,
        email: project.owner.email,
      } : null,
      member_count: project.project_members?.length || 0,
      repository_count: project.project_repositories?.length || 0,
      created_at: project.created_at,
      updated_at: project.updated_at,
    }))

    return NextResponse.json({ projects: projectsWithCounts })
  } catch (error: any) {
    console.error('Error in GET /api/projects:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
