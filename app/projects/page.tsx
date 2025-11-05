'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import Link from 'next/link'

interface Project {
  id: string
  name: string
  description: string | null
  github_account_id: string | null
  github_account: {
    account_name: string
    github_username: string | null
  } | null
  member_count: number
  repository_count: number
  owner_id: string
  owner: {
    id: string
    email: string
  } | null
  created_at: string
  updated_at: string
}

export default function ProjectsPage() {
  return <ProjectsContent />
}

function ProjectsContent() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      if (!response.ok) throw new Error('Failed to fetch projects')
      const data = await response.json()
      setProjects(data.projects || [])
    } catch (error: any) {
      setError(error.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading projects...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">View Projects</h1>
          <p className="mt-2 text-gray-600">
            View projects you have access to. Create and manage projects in Project Tim.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="text-center text-gray-500 p-8 bg-white rounded-lg shadow-md">
            <p className="text-lg mb-4">No projects found.</p>
            <p>Projects you have access to will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block">
                <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 h-full flex flex-col justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">{project.name}</h2>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                      {project.description || 'No description provided.'}
                    </p>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    <p>Owner: {project.owner?.email || 'N/A'}</p>
                    <p>{project.member_count} Members</p>
                    <p>{project.repository_count} Repositories</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
