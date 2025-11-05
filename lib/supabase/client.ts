// import { createBrowserClient } from '@supabase/ssr'

// Supabase disabled - uncomment when ready to use Supabase
export function createClient() {
  // Return a mock client that won't be used
  // return createBrowserClient(
  //   process.env.NEXT_PUBLIC_SUPABASE_URL!,
  //   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  // )
  throw new Error('Supabase is disabled. Please configure Supabase environment variables or update the code to work without authentication.')
}

