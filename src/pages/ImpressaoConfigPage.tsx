import { useState } from "react";
import { Printer, Server, ListChecks } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentsTab } from "@/components/impressao/AgentsTab";
import { ImpressorasTab } from "@/components/impressao/ImpressorasTab";
import { FilaImpressaoTab } from "@/components/impressao/FilaImpressaoTab";

interface ImpressaoConfigPageProps {
  onNavigate: (path: string) => void;
}

export function ImpressaoConfigPage(_: ImpressaoConfigPageProps) {
  const [tab, setTab] = useState<"agents" | "impressoras" | "fila">("agents");

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div className="shrink-0 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
          <Printer size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Configurações de Impressão</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie agents, impressoras e monitore a fila de impressão
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="agents" className="gap-2">
            <Server size={14} /> Agents
          </TabsTrigger>
          <TabsTrigger value="impressoras" className="gap-2">
            <Printer size={14} /> Impressoras
          </TabsTrigger>
          <TabsTrigger value="fila" className="gap-2">
            <ListChecks size={14} /> Fila de Impressão
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden" forceMount>
          <AgentsTab />
        </TabsContent>
        <TabsContent value="impressoras" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden" forceMount>
          <ImpressorasTab />
        </TabsContent>
        <TabsContent value="fila" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden" forceMount>
          <FilaImpressaoTab active={tab === "fila"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
