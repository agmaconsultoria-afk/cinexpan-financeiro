import type { Metadata } from "next";
import "./globals.css";
import { DataProvider } from "@/lib/data-context";
import { RastreioProvider } from "@/lib/rastreio/context";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const metadata: Metadata = {
  title: "Portal Financeiro Cinexpan",
  description: "Gestão financeira e indicadores para a diretoria - Cinexpan",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="font-sans">
        <DataProvider>
          <RastreioProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col lg:pl-64">
              <Topbar />
              <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            </div>
          </div>
          </RastreioProvider>
        </DataProvider>
      </body>
    </html>
  );
}
