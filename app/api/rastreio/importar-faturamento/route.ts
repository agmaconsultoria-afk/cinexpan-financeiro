import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { setFaturamento, setVendasPF } from "@/lib/rastreio/db";
import { exigirEdicao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/rastreio/importar-faturamento
 * Content-Type: multipart/form-data
 * Campo "arquivo": .xlsx com colunas [data_serial, faturamento, vendasPF]
 * (Linha 0 = cabeçalho ignorada; datas em serial do Excel)
 */
export async function POST(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, erro: "Envie o arquivo via multipart/form-data." }, { status: 400 });
  }

  const arquivo = formData.get("arquivo");
  if (!arquivo || typeof arquivo === "string") {
    return NextResponse.json({ ok: false, erro: "Campo 'arquivo' ausente ou inválido." }, { status: 400 });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return NextResponse.json({ ok: false, erro: "Planilha vazia ou inválida." }, { status: 400 });
  }

  const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];

  const meses: string[] = [];
  let importados = 0;
  const erros: string[] = [];

  // Linha 0 = cabeçalho; linhas seguintes: [serial_data, faturamento, vendasPF]
  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    if (!Array.isArray(row) || row.length < 2) continue;

    const serial = row[0];
    const fatBruto = row[1];
    const pfBruto = row[2];

    if (typeof serial !== "number" || serial <= 0) continue;
    if (fatBruto == null && pfBruto == null) continue;

    // Converter serial do Excel para YYYY-MM
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed) { erros.push(`Linha ${i + 1}: data inválida (serial=${serial})`); continue; }
    const mes = `${parsed.y}-${String(parsed.m).padStart(2, "0")}`;

    const faturamento = typeof fatBruto === "number" ? Math.round(fatBruto * 100) / 100 : null;
    const vendasPF = typeof pfBruto === "number" ? Math.round(pfBruto * 100) / 100 : null;

    try {
      if (faturamento !== null) await setFaturamento(mes, faturamento);
      if (vendasPF !== null) await setVendasPF(mes, vendasPF);
      meses.push(mes);
      importados++;
    } catch (e) {
      erros.push(`Linha ${i + 1} (${mes}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (importados === 0 && erros.length > 0) {
    return NextResponse.json({ ok: false, erro: erros[0], erros }, { status: 422 });
  }

  return NextResponse.json({ ok: true, importados, meses, erros: erros.length ? erros : undefined });
}
