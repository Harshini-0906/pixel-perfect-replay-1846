// Supabase client initialization for ApprovalFlow demo
// File: src/lib/supabase.ts

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Supabase project credentials (demo mode)
const SUPABASE_URL = "https://tmcmuqmrijmogjpugfam.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fwUh6i8USV-Z0nosd6OL6g_TLDsCm22";

/**
 * Singleton Supabase client used across the application.
 * In a real production app you would hide the anon key in env vars, but for
 * this demo we embed it directly.
 */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Type representing a user in the demo environment.
 * role can be "institution", "aicte_office", or "admin".
 */
export interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: "institution" | "aicte_office" | "admin";
}

// Hard‑coded test users for demo mode – you can switch them via a simple UI.
export const DEMO_USERS: DemoUser[] = [
  {
    id: "inst-001",
    email: "institution@example.com",
    name: "Demo Institution",
    role: "institution",
  },
  {
    id: "aicte-001",
    email: "aicte@example.com",
    name: "AICTE Officer",
    role: "aicte_office",
  },
  {
    id: "admin-001",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
  },
];

/**
 * Simple wrapper to sign‑in a demo user using Supabase's magic‑link method.
 * In a real app you would use proper email/password or OAuth flows.
 */
export async function signInDemoUser(user: DemoUser) {
  // The magic link will be sent to the provided email – in demo we just
  // sign in anonymously and attach the user data to the session.
  const { error } = await supabase.auth.signInWithOtp({ email: user.email });
  if (error) throw error;
  // Store user metadata in localStorage for quick access
  localStorage.setItem("demoUser", JSON.stringify(user));
  return user;
}

/**
 * Retrieve the currently logged‑in demo user (if any).
 */
export function getCurrentDemoUser(): DemoUser | null {
  const raw = localStorage.getItem("demoUser");
  return raw ? (JSON.parse(raw) as DemoUser) : null;
}

/**
 * Sign out the current user.
 */
export async function signOutDemoUser() {
  await supabase.auth.signOut();
  localStorage.removeItem("demoUser");
}
