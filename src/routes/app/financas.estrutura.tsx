import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/financas/estrutura")({ component: StructureLayout });

function StructureLayout() {
  return <Outlet />;
}