import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !session.authenticated || !session.username) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <AppShell>{children}</AppShell>
    </SidebarProvider>
  );
}
