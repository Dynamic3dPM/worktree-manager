'use client'

import { createContext, useContext, useEffect, useState } from 'react'
// import { createClient } from '@/lib/supabase/client'
// import type { User } from '@supabase/supabase-js'

// Supabase disabled - using mock types
type User = any // type User = User from '@supabase/supabase-js'

type AuthContextType = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false, // Set to false since we're not loading anything
  signOut: async () => {},
})

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Dev mode: always provide a mock user
  const [user, setUser] = useState<User | null>({ id: 'dev-user', email: 'dev@example.com' })
  const [loading, setLoading] = useState(false) // No loading needed
  
  // const supabase = createClient()

  useEffect(() => {
    // Supabase disabled - no auth session management
    // Get initial session
    // supabase.auth.getSession().then(({ data: { session } }) => {
    //   setUser(session?.user ?? null)
    //   setLoading(false)
    // })

    // Listen for auth changes
    // const {
    //   data: { subscription },
    // } = supabase.auth.onAuthStateChange((_event, session) => {
    //   setUser(session?.user ?? null)
    //   setLoading(false)
    // })

    // return () => subscription.unsubscribe()
    setLoading(false)
  }, []) // Empty dependency array since we're not using supabase

  const signOut = async () => {
    // await supabase.auth.signOut()
    // In dev mode, keep user logged in (just for dev convenience)
    // setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

