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

    // Get members for the project (RLS will filter automatically)
    const { data: members, error } = await supabase
      .from('project_members')
      .select(`
        id,
        user_id,
        role,
        created_at,
        users:user_id (
          id,
          email
        )
      `)
      .eq('project_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching project members:', error)
      return NextResponse.json(
        { error: 'Failed to fetch members' },
        { status: 500 }
      )
    }

    const membersData = (members || []).map((member: any) => ({
      id: member.id,
      user_id: member.user_id,
      role: member.role,
      email: member.users?.email || null,
      created_at: member.created_at,
    }))

    return NextResponse.json({ members: membersData })
  } catch (error: any) {
    console.error('Error in GET /api/projects/[id]/members:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
