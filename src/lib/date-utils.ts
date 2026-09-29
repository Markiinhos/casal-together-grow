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

const MONTH_NAMES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/**
 * Converte YYYY-MM ou YYYY-MM-DD para "Mês de AAAA" (ex: "Setembro de 2026")
 * sem usar `new Date()` para evitar bugs de timezone e "Invalid Date".
 */
export function formatReferenceMonth(refMonth?: string | null): string {
  if (!refMonth) return "—";
  const clean = refMonth.substring(0, 7);
  const parts = clean.split("-");
  if (parts.length < 2) return refMonth;
  const year = parts[0];
  const monthNum = parseInt(parts[1], 10);
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return refMonth;
  return `${MONTH_NAMES_FULL[monthNum - 1]} de ${year}`;
}

/**
 * Converte YYYY-MM-DD (ou ISO) para DD/MM/YYYY
 * Seguro contra timezone shift: não instancia objeto Date sem hora local.
 */
export function formatDateOnly(date?: string | null): string {
  if (!date) return "—";
  const str = String(date).substring(0, 10);
  const parts = str.split("-");
  if (parts.length !== 3) return date;
  const [year, month, day] = parts;
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}

/**
 * Extrai apenas o YYYY-MM-DD de uma data completa
 */
export function normalizeDateOnly(date?: string | null): string | null {
  if (!date) return null;
  return String(date).substring(0, 10);
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
 * Regra canônica:
 * - Compra realizada antes ou NO DIA do fechamento (dia <= closingDay): entra na fatura que fecha nesse mês.
 * - Compra realizada APÓS o fechamento (dia > closingDay): cai para o fechamento do mês seguinte.
 * - Para parcelas i > 1: avança (i - 1) meses a partir do fechamento inicial.
 * - Se dueDay >= closingDay: vencimento no MESMO mês do fechamento (ex: fecha 20/09, vence 28/09).
 * - Se dueDay < closingDay: vencimento no MÊS SEGUINTE ao fechamento (ex: fecha 25/08, vence 05/09).
 * - referenceMonth: YYYY-MM-01 correspondente ao mês do vencimento.
 */
export function resolveCardInvoiceCycle(
  purchaseDate: Date | string,
  closingDay: number,
  dueDay: number,
  installmentNumber: number = 1
): { closingDate: Date; dueDate: Date; referenceMonth: string; closingDateStr: string; dueDateStr: string } {
  let pYear: number;
  let pMonth: number; // 0-based
  let pDay: number;

  if (typeof purchaseDate === "string") {
    const parts = purchaseDate.substring(0, 10).split("-").map(Number);
    pYear = parts[0];
    pMonth = parts[1] - 1;
    pDay = parts[2];
  } else {
    pYear = purchaseDate.getFullYear();
    pMonth = purchaseDate.getMonth();
    pDay = purchaseDate.getDate();
  }

  // Último dia do mês da compra
  const lastDayPurchMonth = new Date(pYear, pMonth + 1, 0).getDate();
  const effectiveCloseDay = Math.min(closingDay, lastDayPurchMonth);

  // Determina mês/ano do fechamento base
  let closeYear = pYear;
  let closeMonth = pMonth;

  if (pDay > effectiveCloseDay) {
    closeMonth += 1;
    if (closeMonth > 11) {
      closeYear += 1;
      closeMonth = 0;
    }
  }

  // Para parcelas > 1, avança meses
  if (installmentNumber > 1) {
    const totalMonths = closeMonth + (installmentNumber - 1);
    closeYear += Math.floor(totalMonths / 12);
    closeMonth = totalMonths % 12;
  }

  const lastDayCloseMonth = new Date(closeYear, closeMonth + 1, 0).getDate();
  const finalCloseDay = Math.min(closingDay, lastDayCloseMonth);

  // Vencimento:
  // Se dueDay >= closingDay -> mesmo mês do fechamento
  // Se dueDay < closingDay -> mês seguinte ao fechamento
  let dueYear = closeYear;
  let dueMonth = closeMonth;

  if (dueDay < closingDay) {
    dueMonth += 1;
    if (dueMonth > 11) {
      dueYear += 1;
      dueMonth = 0;
    }
  }

  const lastDayDueMonth = new Date(dueYear, dueMonth + 1, 0).getDate();
  const finalDueDay = Math.min(dueDay, lastDayDueMonth);

  const closingDateStr = `${closeYear}-${String(closeMonth + 1).padStart(2, "0")}-${String(finalCloseDay).padStart(2, "0")}`;
  const dueDateStr = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-${String(finalDueDay).padStart(2, "0")}`;
  const referenceMonthStr = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-01`;

  const cd = new Date(closeYear, closeMonth, finalCloseDay, 12, 0, 0);
  const dd = new Date(dueYear, dueMonth, finalDueDay, 12, 0, 0);

  return {
    closingDate: cd,
    dueDate: dd,
    referenceMonth: referenceMonthStr,
    closingDateStr,
    dueDateStr,
  };
}
