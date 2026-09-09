import {
  Tag, ShoppingCart, Utensils, Home, Car, Heart, Gift, Music, Plane,
  Book, Coffee, Dumbbell, Wallet, Baby, PawPrint, GraduationCap,
  Stethoscope, Shirt, Wifi, Fuel, Wrench, PiggyBank,
  type LucideIcon,
} from "lucide-react";

/** Ícones disponíveis para categorias/subcategorias (chave salva no banco). */
export const CATEGORY_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "tag", label: "Etiqueta", Icon: Tag },
  { key: "shopping-cart", label: "Mercado", Icon: ShoppingCart },
  { key: "utensils", label: "Comida", Icon: Utensils },
  { key: "home", label: "Casa", Icon: Home },
  { key: "car", label: "Carro", Icon: Car },
  { key: "fuel", label: "Combustível", Icon: Fuel },
  { key: "heart", label: "Amor", Icon: Heart },
  { key: "gift", label: "Presente", Icon: Gift },
  { key: "music", label: "Música", Icon: Music },
  { key: "plane", label: "Viagem", Icon: Plane },
  { key: "book", label: "Estudos", Icon: Book },
  { key: "graduation-cap", label: "Educação", Icon: GraduationCap },
  { key: "coffee", label: "Café", Icon: Coffee },
  { key: "dumbbell", label: "Academia", Icon: Dumbbell },
  { key: "stethoscope", label: "Saúde", Icon: Stethoscope },
  { key: "shirt", label: "Roupas", Icon: Shirt },
  { key: "wifi", label: "Internet", Icon: Wifi },
  { key: "wrench", label: "Manutenção", Icon: Wrench },
  { key: "baby", label: "Filhos", Icon: Baby },
  { key: "paw-print", label: "Pets", Icon: PawPrint },
  { key: "wallet", label: "Contas", Icon: Wallet },
  { key: "piggy-bank", label: "Reserva", Icon: PiggyBank },
];

const MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICONS.map((i) => [i.key, i.Icon]),
);

export function categoryIcon(key: string | null | undefined): LucideIcon {
  return (key && MAP[key]) || Tag;
}

/** Bolinha/quadradinho com o ícone e a cor da categoria. */
export function CategoryIcon({
  icon,
  color,
  size = 36,
  className = "",
}: {
  icon?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = categoryIcon(icon);
  const c = color || "#7B61FF";
  return (
    <div
      className={`rounded-xl flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, background: c + "22", color: c }}
    >
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
    </div>
  );
}
