"use client";

// Seletor de mês/ano com dois dropdowns tradicionais (mais amigável que o
// <input type="month"> nativo). Valor no formato "YYYY-MM".

const MESES: [string, string][] = [
  ["01", "Janeiro"],
  ["02", "Fevereiro"],
  ["03", "Março"],
  ["04", "Abril"],
  ["05", "Maio"],
  ["06", "Junho"],
  ["07", "Julho"],
  ["08", "Agosto"],
  ["09", "Setembro"],
  ["10", "Outubro"],
  ["11", "Novembro"],
  ["12", "Dezembro"],
];

export function SeletorMes({
  value,
  onChange,
  anoMin = 2024,
}: {
  value: string; // "YYYY-MM"
  onChange: (v: string) => void;
  anoMin?: number;
}) {
  const hoje = new Date();
  const padrao = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [ano, mes] = (value && /^\d{4}-\d{2}$/.test(value) ? value : padrao).split("-");

  const anoMax = hoje.getFullYear() + 1;
  const anos: number[] = [];
  for (let a = anoMin; a <= anoMax; a++) anos.push(a);
  if (!anos.includes(Number(ano))) {
    anos.push(Number(ano));
    anos.sort((x, y) => x - y);
  }

  const selectClasse =
    "rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={mes}
        onChange={(e) => onChange(`${ano}-${e.target.value}`)}
        className={selectClasse}
        aria-label="Mês"
      >
        {MESES.map(([v, nome]) => (
          <option key={v} value={v}>
            {nome}
          </option>
        ))}
      </select>
      <select
        value={ano}
        onChange={(e) => onChange(`${e.target.value}-${mes}`)}
        className={selectClasse}
        aria-label="Ano"
      >
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}
