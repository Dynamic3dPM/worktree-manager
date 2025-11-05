'use client'

// Dev mode: auth guard disabled
// import { useEffect } from 'react'
// import { useRouter } from 'next/navigation'
// import { useAuth } from './AuthProvider'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Dev mode: bypass auth guard
  // const { user, loading } = useAuth()
  // const router = useRouter()

  // useEffect(() => {
  //   if (!loading && !user) {
  //     router.push('/auth/login')
  //   }
  // }, [user, loading, router])

  // if (loading) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center">
  //       <div className="text-xl">Loading...</div>
  //     </div>
  //   )
  // }

  // if (!user) {
  //   return null
  // }

  return <>{children}</>
}

