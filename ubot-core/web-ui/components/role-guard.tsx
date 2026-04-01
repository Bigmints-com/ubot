'use client';

import { useRole } from '@/lib/providers/role-provider';
import { Loader2, ShieldAlert } from 'lucide-react';

type Role = 'owner' | 'manager' | 'staff' | 'visitor';

const ROLE_LEVEL: Record<Role, number> = {
  visitor: 0,
  staff: 1,
  manager: 2,
  owner: 3,
};

interface RoleGuardProps {
  minimum: Role;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ minimum, children, fallback }: RoleGuardProps) {
  const { role, loading } = useRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ROLE_LEVEL[role] < ROLE_LEVEL[minimum]) {
    return fallback ?? (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <ShieldAlert className="size-10 text-muted-foreground mb-3" />
        <p className="font-medium">Access Denied</p>
        <p className="text-sm text-muted-foreground mt-1">
          You need at least <span className="font-semibold">{minimum}</span> access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
