import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  titulo: string;
  valor: string;
  icone: LucideIcon;
  cor?: "azul" | "verde" | "vermelho" | "ambar" | "roxo";
  variacao?: string;
  variacaoPositiva?: boolean;
  legenda?: string;
}

const CORES: Record<NonNullable<KpiCardProps["cor"]>, string> = {
  azul: "bg-brand-50 text-brand-600",
  verde: "bg-emerald-50 text-emerald-600",
  vermelho: "bg-rose-50 text-rose-600",
  ambar: "bg-amber-50 text-amber-600",
  roxo: "bg-violet-50 text-violet-600",
};

export function KpiCard({
  titulo,
  valor,
  icone: Icon,
  cor = "azul",
  variacao,
  variacaoPositiva,
  legenda,
}: KpiCardProps) {
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{titulo}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{valor}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${CORES[cor]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {(variacao || legenda) && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {variacao && (
            <span
              className={`font-medium ${
                variacaoPositiva ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {variacao}
            </span>
          )}
          {legenda && <span className="text-slate-400">{legenda}</span>}
        </div>
      )}
    </div>
  );
}
