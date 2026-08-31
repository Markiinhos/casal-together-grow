import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLocalISODate } from "@/lib/date-utils";


// Pluggy SDK is dynamically imported inside handlers so the client bundle stays clean.

async function getPluggyClient() {
  const { PluggyClient } = await import("pluggy-sdk");
  return new PluggyClient({
    clientId: process.env.PLUGGY_CLIENT_ID!,
    clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
  });
}

async function getCoupleId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("couple_id").eq("id", userId).maybeSingle();
  return data?.couple_id ?? null;
}

// 1) Generate a short-lived connect token for the Pluggy Connect widget
export const createPluggyConnectToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId?: string } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    const client = await getPluggyClient();
    const { accessToken } = await client.createConnectToken(data.itemId);
    return { accessToken };
  });

// Map Pluggy connector type → local category
function mapInstitutionType(t?: string): string {
  const v = (t ?? "").toUpperCase();
  if (v.includes("INVEST")) return "investments";
  if (v.includes("CREDIT")) return "credit";
  if (v.includes("DIGITAL") || v.includes("WALLET") || v.includes("PAYMENT")) return "wallet";
  if (v.includes("COOP")) return "cooperative";
  return "bank";
}

// Sync Pluggy connectors → financial_institutions table
export const syncInstitutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const client = await getPluggyClient();
    const { results: connectors } = await client.fetchConnectors({ countries: ["BR"], sandbox: false });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let upserted = 0;
    for (const c of connectors as any[]) {
      const products: string[] = (c.products ?? []).map((p: string) => p.toUpperCase());
      const row = {
        provider: "pluggy",
        pluggy_institution_id: String(c.id),
        external_id: String(c.id),
        name: c.name,
        official_name: c.institutionName ?? c.name,
        image_url: c.imageUrl ?? null,
        primary_color: c.primaryColor ? `#${String(c.primaryColor).replace(/^#/, "")}` : null,
        type: mapInstitutionType(c.type),
        country: (c.country ?? "BR").toUpperCase(),
        supports_open_finance: c.supportsPaymentInitiation === true || products.includes("PAYMENT_DATA") || /open\s*finance/i.test(c.name ?? ""),
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
    return { ok: true, total: connectors.length, upserted };
  });

// Map Pluggy category to local CASAL category name (simple keyword heuristics)
function mapCategory(description: string, pluggyCategory?: string | null): string {
  const t = `${description ?? ""} ${pluggyCategory ?? ""}`.toLowerCase();
  if (/(mercado|super|carrefour|pão de açúcar|extra|atacad|assa[íi])/i.test(t)) return "Mercado";
  if (/(uber|99|ifood|rappi|delivery|restaurant|lanchonete|padaria)/i.test(t)) return "Alimentação";
  if (/(posto|combustível|gasolina|álcool|shell|ipiranga|petrobras)/i.test(t)) return "Transporte";
  if (/(netflix|spotify|prime|disney|hbo|youtube|assinatura)/i.test(t)) return "Assinaturas";
  if (/(farm[áa]cia|droga|hospital|m[ée]dico|consulta)/i.test(t)) return "Saúde";
  if (/(luz|energia|enel|cemig|cpfl|sabesp|agua|internet|vivo|claro|tim|oi|net)/i.test(t)) return "Contas";
  if (/(salário|salario|pagamento|sal[áa]rio)/i.test(t)) return "Salário";
  if (/(transfer|pix|ted|doc)/i.test(t)) return "Transferência";
  return pluggyCategory || "Outros";
}

// 2) Persist a Pluggy item: connection + accounts + cards + recent transactions
export const savePluggyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const coupleId = await getCoupleId(supabase, userId);
    const client = await getPluggyClient();

    const item = await client.fetchItem(data.itemId);

    // Upsert connection
    const { data: connRow, error: connErr } = await supabase
      .from("bank_connections")
      .upsert(
        {
          user_id: userId,
          couple_id: coupleId,
          provider: "pluggy",
          status: item.status ?? "UPDATED",
          pluggy_item_id: item.id,
          institution_id: String(item.connector?.id ?? ""),
          institution_name: item.connector?.name ?? "Banco",
          institution_logo: item.connector?.imageUrl ?? null,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "pluggy_item_id" },
      )
      .select()
      .single();
    if (connErr) throw connErr;

    // Accounts
    const { results: accounts } = await client.fetchAccounts(item.id);
    const { data: upsertedAccounts, error: accErr } = await supabase
      .from("bank_accounts")
      .upsert(
        accounts.map((acc) => ({
          connection_id: connRow.id,
          couple_id: coupleId,
          user_id: userId,
          pluggy_account_id: acc.id,
          type: acc.type,
          subtype: acc.subtype,
          name: acc.name,
          balance: acc.balance ?? 0,
          currency: acc.currencyCode ?? "BRL",
          account_number: acc.number ?? null,
        })),
        { onConflict: "pluggy_account_id" },
      )
      .select("id, pluggy_account_id");
    if (accErr) throw accErr;
    const localAccountIdByPluggyId = new Map(
      (upsertedAccounts ?? []).map((a: any) => [a.pluggy_account_id, a.id as string]),
    );

    // Cards (creditCard accounts)
    for (const acc of accounts.filter((a) => a.type === "CREDIT")) {
      const cc = acc.creditData;
      await supabase.from("synced_cards").upsert(
        {
          connection_id: connRow.id,
          couple_id: coupleId,
          user_id: userId,
          pluggy_card_id: acc.id,
          card_name: acc.name,
          card_brand: cc?.brand ?? null,
          limit_amount: cc?.creditLimit ?? null,
          available_limit: cc?.availableCreditLimit ?? null,
          current_bill: acc.balance,
          closing_day: cc?.balanceCloseDate ? new Date(cc.balanceCloseDate).getDate() : null,
          due_day: cc?.balanceDueDate ? new Date(cc.balanceDueDate).getDate() : null,
        },
        { onConflict: "pluggy_card_id" },
      );
    }

    // Transactions (last 90 days) + auto-import to transactions table
    const from = getLocalISODate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    let imported = 0;
    for (const acc of accounts) {
      const localAccountId = localAccountIdByPluggyId.get(acc.id);
      if (!localAccountId) continue;

      const { results: txs } = await client.fetchTransactions(acc.id, { from, pageSize: 200 });
      if (txs.length === 0) continue;

      const txIds = txs.map((tx) => String(tx.id));

      // One round trip to find which of these transactions already exist locally
      const { data: existingTxs } = await supabase
        .from("transactions")
        .select("id, pluggy_transaction_id")
        .in("pluggy_transaction_id", txIds);
      const localTxIdByPluggyTxId = new Map(
        (existingTxs ?? []).map((t: any) => [t.pluggy_transaction_id, t.id as string]),
      );

      // Bulk-insert only the transactions we don't have yet
      const newTxs = txs.filter((tx) => !localTxIdByPluggyTxId.has(String(tx.id)));
      if (newTxs.length > 0) {
        const { data: inserted, error: insErr } = await supabase
          .from("transactions")
          .insert(
            newTxs.map((tx) => ({
              user_id: userId,
              couple_id: coupleId,
              type: (tx.amount ?? 0) < 0 || tx.type === "DEBIT" ? "expense" : "income",
              amount: Math.abs(tx.amount ?? 0),
              description: tx.description ?? "Importado",
              date: getLocalISODate(tx.date instanceof Date ? tx.date : new Date(tx.date)),
              pluggy_transaction_id: tx.id,
              imported_from: "pluggy",
            })),
          )
          .select("id, pluggy_transaction_id");
        if (insErr) throw insErr;
        for (const row of inserted ?? []) {
          localTxIdByPluggyTxId.set((row as any).pluggy_transaction_id, (row as any).id);
        }
        imported += inserted?.length ?? 0;
      }

      // Bulk upsert the bank_transactions mirror rows
      const { error: bankTxErr } = await supabase.from("bank_transactions").upsert(
        txs.map((tx) => ({
          account_id: localAccountId,
          couple_id: coupleId,
          user_id: userId,
          pluggy_transaction_id: tx.id,
          description: tx.description ?? "",
          amount: tx.amount ?? 0,
          currency: tx.currencyCode ?? "BRL",
          category: mapCategory(tx.description ?? "", tx.category),
          pluggy_category: tx.category ?? null,
          date: getLocalISODate(tx.date instanceof Date ? tx.date : new Date(tx.date)),
          type: tx.type ?? null,
          imported_tx_id: localTxIdByPluggyTxId.get(String(tx.id)) ?? null,
        })),
        { onConflict: "pluggy_transaction_id" },
      );
      if (bankTxErr) throw bankTxErr;
    }

    return { ok: true, connectionId: connRow.id, imported };
  });

// 3) Re-sync an existing connection
export const syncPluggyConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { connectionId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: conn } = await supabase
      .from("bank_connections")
      .select("pluggy_item_id")
      .eq("id", data.connectionId)
      .single();
    if (!conn?.pluggy_item_id) throw new Error("Conexão sem item Pluggy");
    const client = await getPluggyClient();
    await client.updateItem(conn.pluggy_item_id);
    return await (savePluggyItem as any)({ data: { itemId: conn.pluggy_item_id } });
  });

// 4) Delete connection (also removes from Pluggy)
export const deletePluggyConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { connectionId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: conn } = await supabase
      .from("bank_connections")
      .select("pluggy_item_id, user_id")
      .eq("id", data.connectionId)
      .eq("user_id", userId)
      .single();
    if (!conn) throw new Error("Conexão não encontrada ou sem permissão");
    if (conn?.pluggy_item_id) {
      try {
        const client = await getPluggyClient();
        await client.deleteItem(conn.pluggy_item_id);
      } catch (e) {
        console.error("Pluggy deleteItem error", e);
      }
    }
    await supabase.from("bank_connections").delete().eq("id", data.connectionId);
    return { ok: true };
  });
