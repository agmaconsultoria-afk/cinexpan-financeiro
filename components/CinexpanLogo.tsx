/**
 * Logotipo Cinexpan no estilo da marca: "CINEXPAN" em branco, itálico e
 * sublinhado, com a assinatura "ARGILA EXPANDIDA" e bolinhas de argila.
 */
export function CinexpanLogo({
  tamanho = "md",
  comBolinhas = true,
}: {
  tamanho?: "sm" | "md" | "lg";
  comBolinhas?: boolean;
}) {
  const tituloClasse =
    tamanho === "lg" ? "text-3xl" : tamanho === "sm" ? "text-lg" : "text-2xl";
  const subClasse = tamanho === "lg" ? "text-[11px]" : "text-[9px]";

  return (
    <div className="flex items-center gap-2.5">
      {comBolinhas && (
        <div className="relative h-9 w-9 shrink-0">
          <span className="clay-ball absolute left-0 top-0 h-5 w-5" />
          <span className="clay-ball absolute right-0 top-1 h-4 w-4" />
          <span className="clay-ball absolute bottom-0 left-2 h-6 w-6" />
        </div>
      )}
      <div className="leading-none">
        <div className={`logo-cinexpan ${tituloClasse}`}>CINEXPAN</div>
        <div className={`logo-sub mt-1 font-medium text-brand-200 ${subClasse}`}>
          ARGILA EXPANDIDA
        </div>
      </div>
    </div>
  );
}
