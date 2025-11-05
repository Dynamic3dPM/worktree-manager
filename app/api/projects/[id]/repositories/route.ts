import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user has access to the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Get repositories for the project (RLS will filter automatically)
    const { data: repositories, error } = await supabase
      .from('project_repositories')
      .select(`
        id,
        repository_full_name,
        github_account_id,
        tracked_branch,
        created_at,
        github_accounts (
          id,
          account_name,
          github_username
        )
      `)
      .eq('project_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching project repositories:', error)
      return NextResponse.json(
        { error: 'Failed to fetch repositories' },
        { status: 500 }
      )
    }

    const repositoriesData = (repositories || []).map((repo: any) => ({
      id: repo.id,
      repository_full_name: repo.repository_full_name,
      github_account_id: repo.github_account_id,
      tracked_branch: repo.tracked_branch || 'dev',
      github_account: repo.github_accounts ? {
        id: repo.github_accounts.id,
        account_name: repo.github_accounts.account_name,
        github_username: repo.github_accounts.github_username,
      } : null,
      created_at: repo.created_at,
    }))

    return NextResponse.json({ repositories: repositoriesData })
  } catch (error: any) {
    console.error('Error in GET /api/projects/[id]/repositories:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user has access to the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Only owners can update tracked branches
    if (project.owner_id !== user.id) {
      return NextResponse.json(
        { error: 'Only project owners can update tracked branches' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { repository_id, tracked_branch } = body

    if (!repository_id || !tracked_branch) {
      return NextResponse.json(
        { error: 'repository_id and tracked_branch are required' },
        { status: 400 }
      )
    }

    // Update the tracked branch
    const { data: updated, error: updateError } = await supabase
      .from('project_repositories')
      .update({ tracked_branch })
      .eq('id', repository_id)
      .eq('project_id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating tracked branch:', updateError)
      return NextResponse.json(
        { error: 'Failed to update tracked branch' },
        { status: 500 }
      )
    }

    return NextResponse.json({ repository: updated })
  } catch (error: any) {
    console.error('Error in PATCH /api/projects/[id]/repositories:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
