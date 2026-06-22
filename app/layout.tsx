import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/lib/data-context";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Portal Financeiro Cinexpan",
  description: "Gestão financeira e indicadores para a diretoria - Cinexpan",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans`}>
        <DataProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col lg:pl-64">
              <Topbar />
              <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            </div>
          </div>
        </DataProvider>
      </body>
    </html>
  );
}
