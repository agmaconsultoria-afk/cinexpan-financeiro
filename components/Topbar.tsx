"use client";

import { Menu } from "lucide-react";
import { useDados } from "@/lib/data-context";
import { rotuloMes } from "@/lib/format";
import { Database, FileSpreadsheet } from "lucide-react";

interface TopbarProps {
  onAbrirMenu: () => void;
}

export function Topbar({ onAbrirMenu }: TopbarProps) {
  const { periodoInicio, periodoFim, setPeriodo, meses, fonte, carregado } = useDados();

  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        {/* Hamburguer — visível apenas em mobile */}
        <button
          onClick={onAbrirMenu}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            fonte === "planilha"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {fonte === "planilha" ? (
            <>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Dados da planilha
            </>
          ) : (
            <>
              <Database className="h-3.5 w-3.5" /> Dados de exemplo
            </>
          )}
        </span>
      </div>

      {carregado && meses.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-slate-500 sm:inline">Período:</span>
          <select
            value={periodoInicio}
            onChange={(e) => setPeriodo(e.target.value, periodoFim)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {rotuloMes(m)}
              </option>
            ))}
          </select>
          <span className="text-slate-400">até</span>
          <select
            value={periodoFim}
            onChange={(e) => setPeriodo(periodoInicio, e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {rotuloMes(m)}
              </option>
            ))}
          </select>
        </div>
      )}
    </header>
  );
}
