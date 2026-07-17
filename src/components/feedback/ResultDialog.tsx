import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Copy, ChevronDown } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { formatErrorForCopy } from "@/lib/errorMapper";

export interface ResultDialogProps {
  open: boolean;
  onClose: () => void;
  type: "success" | "warning" | "error";
  title: string;
  details?: string;
  errorCode?: string;
  technicalMessage?: string;
  instruction?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  coletorMode?: boolean;
}

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    iconColor: "text-green-400",
    iconBg: "bg-green-500/15",
    borderColor: "border-green-500/30",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-500/15",
    borderColor: "border-yellow-500/30",
  },
  error: {
    icon: XCircle,
    iconColor: "text-red-400",
    iconBg: "bg-red-500/15",
    borderColor: "border-red-500/30",
  },
} as const;

export function ResultDialog({
  open,
  onClose,
  type,
  title,
  details,
  errorCode,
  technicalMessage,
  instruction,
  confirmLabel = "OK",
  onConfirm,
  secondaryLabel,
  onSecondary,
  coletorMode = false,
}: ResultDialogProps) {
  const [techOpen, setTechOpen] = useState(false);

  const config = TYPE_CONFIG[type];
  const IconComponent = config.icon;
  const iconSize = coletorMode ? 56 : 40;
  const hasTechnicalDetails = !coletorMode && Boolean(errorCode || technicalMessage);

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    else onClose();
  };

  const handleCopyError = () => {
    const text = formatErrorForCopy({
      type: type === "success" ? "business" : type === "warning" ? "validation" : "system",
      title,
      errorCode,
      technicalMessage,
    });
    navigator.clipboard.writeText(text).then(() => {
      toast.info("Detalhes copiados para a área de transferência");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className={`max-w-md bg-card border ${config.borderColor} text-foreground`}
      >
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          {/* Ícone */}
          <div
            className={`rounded-full ${config.iconBg} flex items-center justify-center`}
            style={{ width: iconSize + 24, height: iconSize + 24 }}
          >
            <IconComponent size={iconSize} className={config.iconColor} strokeWidth={2} />
          </div>

          {/* Título */}
          <h2
            className={`font-bold text-foreground ${
              coletorMode ? "text-2xl" : "text-lg"
            }`}
          >
            {title}
          </h2>

          {/* Detalhes */}
          {details && (
            <p
              className={`text-muted-foreground ${
                coletorMode ? "text-base" : "text-sm"
              }`}
            >
              {details}
            </p>
          )}

          {/* Instrução no coletor: destacada */}
          {instruction && coletorMode && (
            <div className="w-full mt-2 rounded-lg border border-border bg-secondary/40 px-4 py-3">
              <p className="text-base font-medium text-foreground">{instruction}</p>
            </div>
          )}

          {/* Seção técnica (web) */}
          {hasTechnicalDetails && (
            <Collapsible
              open={techOpen}
              onOpenChange={setTechOpen}
              className="w-full mt-2"
            >
              <CollapsibleTrigger className="flex items-center justify-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown
                  size={14}
                  className={`transition-transform ${techOpen ? "rotate-180" : ""}`}
                />
                Detalhes técnicos
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-3 text-left space-y-2">
                  {errorCode && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Código: </span>
                      <span className="font-mono text-foreground">{errorCode}</span>
                    </div>
                  )}
                  {technicalMessage && (
                    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                      {technicalMessage}
                    </pre>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyError}
                    className="w-full gap-2"
                  >
                    <Copy size={14} />
                    Copiar erro completo
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Instrução no web (sem coletorMode) */}
          {instruction && !coletorMode && (
            <p className="text-sm text-muted-foreground italic">{instruction}</p>
          )}
        </div>

        {/* Botões */}
        <div
          className={`flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4 ${
            coletorMode ? "sm:flex-col-reverse" : ""
          }`}
        >
          {secondaryLabel && onSecondary && (
            <Button
              variant="outline"
              onClick={onSecondary}
              className={coletorMode ? "h-12 text-base" : ""}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button
            onClick={handleConfirm}
            className={coletorMode ? "h-12 text-base font-bold" : ""}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
