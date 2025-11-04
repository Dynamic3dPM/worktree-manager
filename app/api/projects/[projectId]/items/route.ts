import { NextResponse } from 'next/server';
import {
  createDraftIssue,
  updateProjectItem,
  moveItemToColumn,
  getOrCreateBacklogColumn,
  deleteProjectItem,
} from '@/app/lib/github-projects';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { title, body: itemBody, columnId } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // Use provided columnId or find/create backlog column
    const targetColumnId = columnId || await getOrCreateBacklogColumn(projectId);

    const item = await createDraftIssue(
      projectId,
      targetColumnId,
      title,
      itemBody
    );

    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create project item' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { itemId, title, body: itemBody, columnId, position } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Update item properties if provided
    if (title || itemBody !== undefined) {
      await updateProjectItem(itemId, title, itemBody);
    }

    // Move item to different column if provided
    if (columnId) {
      await moveItemToColumn(itemId, columnId, position);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update project item' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    await deleteProjectItem(itemId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete project item' },
      { status: 500 }
    );
  }
}

