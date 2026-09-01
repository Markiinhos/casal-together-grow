import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/cartoes")({
  component: CartoesLayout,
});

/**
 * Layout route for /app/cartoes and its children (/$cardId/faturas,
 * /$cardId/faturas/$invoiceId). When the user is at exactly /app/cartoes
 * (index), the Outlet renders CardsPage (cartoes.index.tsx). When a child
 * route is active, the Outlet renders the child's component instead.
 */
function CartoesLayout() {
  return <Outlet />;
}
