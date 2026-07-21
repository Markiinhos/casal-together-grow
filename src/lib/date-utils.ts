/**
 * Utilitários centralizados para manipulação de datas.
 * Resolve bugs de timezone causados por new Date().toISOString()
 * que convertem a data local para UTC e alteram o dia.
 */

/**
 * Retorna a data atual no formato YYYY-MM-DD com base no fuso local do usuário.
 * Equivalente seguro para getLocalISODate(new Date()).
 */
export function getLocalISODate(dateObj: Date = new Date()): string {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converte YYYY-MM-DD para DD/MM/YYYY
 */
export function formatDateOnly(date?: string | null): string {
  if (!date) return "";
  const [year, month, day] = date.substring(0, 10).split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

/**
 * Extrai apenas o YYYY-MM-DD de uma data completa
 */
export function normalizeDateOnly(date?: string | null): string | null {
  if (!date) return null;
  return date.substring(0, 10);
}

/**
 * Converte DD/MM/YYYY para YYYY-MM-DD
 */
export function toDatabaseDate(value: string): string {
  const parts = value.split("/");
  if (parts.length !== 3) return value;
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

/**
 * Resolve o ciclo de fatura de cartão exatamente como a função PostgreSQL (resolve_card_invoice_cycle).
 * 
 * @param purchaseDate Data da compra (Date object)
 * @param closingDay Dia de fechamento do cartão
 * @param dueDay Dia de vencimento do cartão
 * @param installmentNumber Número da parcela (default 1)
 */
export function resolveCardInvoiceCycle(
  purchaseDate: Date,
  closingDay: number,
  dueDay: number,
  installmentNumber: number = 1
): { closingDate: Date; dueDate: Date; referenceMonth: string } {
  const baseYear = purchaseDate.getFullYear();
  const baseMonth = purchaseDate.getMonth();
  
  // Último dia do mês base
  const lastDay = new Date(baseYear, baseMonth + 1, 0).getDate();
  const effectiveClose = new Date(baseYear, baseMonth, Math.min(closingDay, lastDay));
  
  let cd = new Date(effectiveClose);
  // Se a compra foi após o fechamento, cai para o próximo fechamento
  if (purchaseDate > effectiveClose) {
    cd.setMonth(cd.getMonth() + 1);
  }
  
  // Adiciona meses para as parcelas
  if (installmentNumber > 1) {
    cd.setMonth(cd.getMonth() + (installmentNumber - 1));
  }
  
  // O vencimento ocorre no mês seguinte ao fechamento
  const dd = new Date(cd.getFullYear(), cd.getMonth() + 1, dueDay);
  
  // O mês de referência é YYYY-MM correspondente ao mês do vencimento (primeiro dia do mês)
  const refYear = dd.getFullYear();
  const refMonth = String(dd.getMonth() + 1).padStart(2, "0");
  const referenceMonthStr = `${refYear}-${refMonth}-01`;
  
  return { closingDate: cd, dueDate: dd, referenceMonth: referenceMonthStr };
}
