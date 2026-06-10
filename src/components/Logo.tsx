import logoAsset from "@/assets/casal-logo.png.asset.json";

export function Logo({ size = 48, withText = false, className = "" }: { size?: number; withText?: boolean; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <img src={logoAsset.url} alt="CASAL" width={size} height={size} className="rounded-2xl" style={{ width: size, height: size }} />
      {withText && <span className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-primary)" }}>Casal</span>}
    </div>
  );
}
