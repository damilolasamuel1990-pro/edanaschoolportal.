import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://cehqwkzztmfmsqtylshc.supabase.co";
export const SUPABASE_KEY = "sb_publishable_CEeNvHZZSx8zWaPUJ8nKlA_mkWjaPQ6";

/** Main client — holds the signed-in user's session. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Throwaway client used ONLY by the Super Admin to create new accounts.
 * Creating a user with the main client would replace the Super Admin's
 * session with the new user's session — this one never persists anything,
 * so the Super Admin stays signed in.
 */
export function createEphemeralClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "edana-ephemeral-signup",
    },
  });
}
