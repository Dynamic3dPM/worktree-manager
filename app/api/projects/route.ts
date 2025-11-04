import { NextResponse } from 'next/server';
import {
  listOrgProjects,
  listUserProjects,
  createOrgProject,
  createUserProject,
  findOrCreateWorkspaceProject,
  getAuthenticatedUser,
} from '@/app/lib/github-projects';

const GITHUB_ORG = process.env.GITHUB_ORG || 'AutoRemediation';

export async function GET() {
  try {
    // Try org projects first
    let projects;
    try {
      projects = await listOrgProjects(GITHUB_ORG);
    } catch (error: any) {
      // If org projects fail with 404, try user projects
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        try {
          const user = await getAuthenticatedUser();
          projects = await listUserProjects(user);
        } catch (userError: any) {
          return NextResponse.json(
            { 
              error: `Failed to list projects. Organization "${GITHUB_ORG}" not found or inaccessible. User projects also failed: ${userError.message}`,
              suggestion: 'Check GITHUB_ORG environment variable or ensure your token has access to the organization.'
            },
            { status: 404 }
          );
        }
      } else {
        throw error;
      }
    }
    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, body: projectBody } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    // Try to create org project, fallback to user project if org fails
    let project;
    try {
      project = await createOrgProject(GITHUB_ORG, name, projectBody);
    } catch (error: any) {
      // If org creation fails with 404, try user project
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        try {
          const user = await getAuthenticatedUser();
          project = await createUserProject(user, name, projectBody);
        } catch (userError: any) {
          return NextResponse.json(
            { 
              error: `Failed to create project. Organization "${GITHUB_ORG}" not found or inaccessible. User project creation also failed: ${userError.message}`,
              suggestion: 'Check GITHUB_ORG environment variable or ensure your token has Projects permissions.'
            },
            { status: 404 }
          );
        }
      } else {
        throw error;
      }
    }

    return NextResponse.json({ project });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create project' },
      { status: 500 }
    );
  }
}

