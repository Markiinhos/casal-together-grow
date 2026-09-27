import { createFileRoute } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/app/financas/estrutura/dividas")({
  head: () => ({
    meta: [
      { title: "Dívidas — CASAL" },
      { name: "description", content: "Acompanhamento manual e plano de quitação das dívidas do casal." },
      { property: "og:title", content: "Dívidas — CASAL" },
      { property: "og:description", content: "Acompanhamento manual e plano de quitação das dívidas do casal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebtsPage,
});

function DebtsPage() {
  return (
    <>
      <PageHeader title="Dívidas" subtitle="Plano para limpar o nome" fallbackRoute="/app/financas/estrutura" />
      <main className="px-4 py-6 pb-24">
        <EmptyState icon={ReceiptText} title="Nenhuma dívida cadastrada" description="O cadastro e o plano de quitação ainda estão sendo preparados." />
      </main>
    </>
  );
}