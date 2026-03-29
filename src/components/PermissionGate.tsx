import { ReactNode } from "react";
import { usePermissions } from "@/contexts/PermissionsContext";

interface PermissionGateProps {
  modulo: string;
  acao: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ modulo, acao, children, fallback = null }: PermissionGateProps) {
  const { can } = usePermissions();
  if (!can(modulo, acao)) return <>{fallback}</>;
  return <>{children}</>;
}
