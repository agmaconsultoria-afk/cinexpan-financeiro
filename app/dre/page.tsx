"use client";

import { Clock } from "lucide-react";
import { PageHeader } from "@/components/ui";

export default function DrePage() {
  return (
    <div>
      <PageHeader
        titulo="DRE — Demonstração do Resultado"
        subtitulo="Resultado financeiro consolidado por período"
      />
      <div className="card flex flex-col items-center justify-center gap-4 py-20 text-center">
        <Clock className="h-12 w-12 text-brand-300" />
        <h2 className="text-xl font-semibold text-slate-700">Em breve</h2>
        <p className="max-w-sm text-sm text-slate-400">
          Este módulo está em desenvolvimento e será disponibilizado em breve.
        </p>
      </div>
    </div>
  );
}
