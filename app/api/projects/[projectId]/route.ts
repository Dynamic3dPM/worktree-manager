import { NextResponse } from 'next/server';
import {
  getProject,
  getProjectColumns,
  getColumnItems,
} from '@/app/lib/github-projects';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await getProject(projectId);
    const columns = await getProjectColumns(projectId);

    // Get items for each column
    const columnsWithItems = await Promise.all(
      columns.map(async (column) => {
        const items = await getColumnItems(column.id);
        return {
          ...column,
          items,
        };
      })
    );

    return NextResponse.json({
      project,
      columns: columnsWithItems,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

