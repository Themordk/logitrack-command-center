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
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopNav currentPath={currentPath} onNavigate={onNavigate} />
      <main className="flex flex-col flex-1 min-h-0 pt-14">
        {/* Subheader breadcrumb */}
        <div className="shrink-0 border-b border-border bg-[hsl(var(--surface-2))/50] px-6 py-2.5">
          <Breadcrumb items={breadcrumb} onNavigate={onNavigate} />
        </div>
        <div className="flex-1 min-h-0 p-6 flex flex-col overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
