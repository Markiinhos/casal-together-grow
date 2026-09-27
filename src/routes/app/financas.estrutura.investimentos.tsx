import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/app/financas/estrutura/investimentos")({
  head: () => ({
    meta: [
      { title: "Investimentos — CASAL" },
      { name: "description", content: "Acompanhamento manual dos investimentos do casal." },
      { property: "og:title", content: "Investimentos — CASAL" },
      { property: "og:description", content: "Acompanhamento manual dos investimentos do casal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestmentsPage,
});

function InvestmentsPage() {
  return (
    <>
      <PageHeader title="Investimentos" subtitle="Acompanhamento manual" fallbackRoute="/app/financas/estrutura" />
      <main className="px-4 py-6 pb-24">
        <EmptyState icon={Landmark} title="Nenhum investimento cadastrado" description="O cadastro de investimentos ainda está sendo preparado." />
      </main>
    </>
  );
}