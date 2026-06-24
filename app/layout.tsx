import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";

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
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
