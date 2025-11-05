import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGitHubClient } from '@/lib/github/client'

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

    // Get GitHub accounts for the user (RLS will filter automatically)
    const { data: accounts, error } = await supabase
      .from('github_accounts')
      .select('id, account_name, github_username, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching GitHub accounts:', error)
      return NextResponse.json(
        { error: 'Failed to fetch GitHub accounts' },
        { status: 500 }
      )
    }

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error: any) {
    console.error('Error in GET /api/github-accounts:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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

    const body = await request.json()
    const { account_name, token } = body

    if (!account_name || !token) {
      return NextResponse.json(
        { error: 'account_name and token are required' },
        { status: 400 }
      )
    }

    // Validate token with GitHub API
    const githubClient = createGitHubClient(token)
    let githubUser: { login: string } | null = null
    
    try {
      githubUser = await githubClient.getAuthenticatedUser()
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Invalid GitHub token. Please check your token and try again.' },
        { status: 400 }
      )
    }

    // Check if account name already exists for this user
    const { data: existing } = await supabase
      .from('github_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('account_name', account_name)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this name already exists' },
        { status: 400 }
      )
    }

    // Store encrypted token (for now, we'll store it as-is; in production use encryption)
    // TODO: Implement proper encryption using Supabase Vault or pgcrypto
    const { data: account, error } = await supabase
      .from('github_accounts')
      .insert({
        user_id: user.id,
        account_name,
        encrypted_token: token, // In production, encrypt this
        github_username: githubUser.login,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating GitHub account:', error)
      return NextResponse.json(
        { error: 'Failed to create GitHub account' },
        { status: 500 }
      )
    }

    // Return account without the token
    const { encrypted_token, ...accountWithoutToken } = account
    return NextResponse.json({ account: accountWithoutToken })
  } catch (error: any) {
    console.error('Error in POST /api/github-accounts:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
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

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      )
    }

    // Delete the account (RLS will ensure user can only delete their own)
    const { error } = await supabase
      .from('github_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting GitHub account:', error)
      return NextResponse.json(
        { error: 'Failed to delete GitHub account' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/github-accounts:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

