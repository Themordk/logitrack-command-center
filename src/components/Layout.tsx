import { ReactNode } from "react";
import { TopNav } from "./TopNav";
import { Breadcrumb } from "./Breadcrumb";

interface LayoutProps {
  children: ReactNode;
  currentPath: string;
  breadcrumb: { label: string; path?: string }[];
  onNavigate: (path: string) => void;
}

export function Layout({ children, currentPath, breadcrumb, onNavigate }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav currentPath={currentPath} onNavigate={onNavigate} />
      <main className="pt-14">
        {/* Subheader breadcrumb */}
        <div className="border-b border-border bg-[hsl(var(--surface-2))/50] px-6 py-2.5">
          <Breadcrumb items={breadcrumb} onNavigate={onNavigate} />
        </div>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
