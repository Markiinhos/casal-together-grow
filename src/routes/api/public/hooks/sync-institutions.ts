import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/public/hooks/sync-institutions")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const expectedSecret = process.env.SYNC_SECRET;
          const providedSecret = getRequest()?.headers.get("x-sync-secret");
          if (!expectedSecret || providedSecret !== expectedSecret) {
            return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { PluggyClient } = await import("pluggy-sdk");
          const client = new PluggyClient({
            clientId: process.env.PLUGGY_CLIENT_ID!,
            clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
          });
          const { results: connectors } = await client.fetchConnectors({ countries: ["BR"], sandbox: false });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          function mapType(t?: string): string {
            const v = (t ?? "").toUpperCase();
            if (v.includes("INVEST")) return "investments";
            if (v.includes("CREDIT")) return "credit";
            if (v.includes("DIGITAL") || v.includes("WALLET") || v.includes("PAYMENT")) return "wallet";
            if (v.includes("COOP")) return "cooperative";
            return "bank";
          }

          let upserted = 0;
          for (const c of connectors as any[]) {
            const products: string[] = (c.products ?? []).map((p: string) => String(p).toUpperCase());
            const row = {
              provider: "pluggy",
              pluggy_institution_id: String(c.id),
              external_id: String(c.id),
              name: c.name,
              official_name: c.institutionName ?? c.name,
              image_url: c.imageUrl ?? null,
              primary_color: c.primaryColor ? `#${String(c.primaryColor).replace(/^#/, "")}` : null,
              type: mapType(c.type),
              country: (c.country ?? "BR").toUpperCase(),
              supports_open_finance: products.includes("PAYMENT_DATA") || /open\s*finance/i.test(c.name ?? ""),
              supports_credit_card: products.includes("CREDIT_CARDS"),
              supports_checking: products.includes("ACCOUNTS") || products.includes("TRANSACTIONS"),
              supports_investments: products.includes("INVESTMENTS"),
              supports_loans: products.includes("LOANS"),
              status: c.health?.status === "OFFLINE" ? "offline" : "active",
              updated_at: new Date().toISOString(),
            };
            const { error } = await supabaseAdmin
              .from("financial_institutions")
              .upsert(row, { onConflict: "provider,pluggy_institution_id" });
            if (!error) upserted++;
          }
          return new Response(JSON.stringify({ ok: true, total: connectors.length, upserted }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
