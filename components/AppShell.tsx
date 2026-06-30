"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { DataProvider } from "@/lib/data-context";
import { RastreioProvider } from "@/lib/rastreio/context";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <DataProvider>
      <RastreioProvider>
        <div className="flex min-h-screen">
          <Sidebar
            mobileAberto={menuMobileAberto}
            onFecharMobile={() => setMenuMobileAberto(false)}
          />
          <div className="flex flex-1 flex-col lg:pl-64">
            <Topbar onAbrirMenu={() => setMenuMobileAberto(true)} />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </RastreioProvider>
    </DataProvider>
  );
}
