import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";

export const Route = createFileRoute("/app/casa/compras")({
  component: ComprasLayout,
});

/**
 * Layout route for /app/casa/compras and its children (/nova, /$id).
 * When the user is at exactly /app/casa/compras (index), we render the
 * listing. When a child route is active (/nova or /$id), the Outlet
 * renders the child's component.
 */
function ComprasLayout() {
  return <Outlet />;
}
