// Demo role store – simple hook to manage the logged‑in demo user role
// File: src/lib/demo-role-store.ts

import { useState, useEffect } from "react";
import { getCurrentDemoUser, DemoUser, signInDemoUser } from "./supabase";
import { Role } from "./workflow";

/**
 * Hook returning the current demo role and a setter.
 * The role is derived from the stored demo user (localStorage) on load.
 * When a user signs in via `signInDemoUser`, the stored user updates and the role
 * reflects the change automatically because the hook reads from storage on mount.
 */
export function useDemoRole(): [Role | null, (role: Role) => void] {
  const [role, setRole] = useState<Role | null>(null);

  // Initialise from persisted demo user
  useEffect(() => {
    const user = getCurrentDemoUser();
    if (user) setRole(user.role as Role);
  }, []);

  const updateRole = (newRole: Role) => {
    setRole(newRole);
  };

  return [role, updateRole];
}

/**
 * Convenience hook that also provides the currently logged‑in demo user object.
 */
export function useDemoUser(): [DemoUser | null] {
  const [user, setUser] = useState<DemoUser | null>(null);
  useEffect(() => {
    setUser(getCurrentDemoUser());
  }, []);
  return [user];
}
