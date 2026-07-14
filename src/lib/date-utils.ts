/**
 * Utilitários centralizados para manipulação de datas.
 * Resolve bugs de timezone causados por new Date().toISOString()
 * que convertem a data local para UTC e alteram o dia.
 */

/**
 * Retorna a data atual no formato YYYY-MM-DD com base no fuso local do usuário.
 * Equivalente seguro para new Date().toISOString().slice(0, 10).
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
