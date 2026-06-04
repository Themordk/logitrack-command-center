import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldSpec {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "switch" | "enum";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  enumValues?: string[];
  step?: string;
  defaultValue?: any;
  hidden?: boolean;
  visibleWhen?: (form: Record<string, any>) => boolean;
  requiredWhen?: (form: Record<string, any>) => boolean;
  disabledWhen?: (form: Record<string, any>) => boolean;
}

interface CrudModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: FieldSpec[];
  initialData?: Record<string, any> | null;
  onSave: (data: Record<string, any>) => Promise<boolean>;
  onFormChange?: (form: Record<string, any>) => void;
}

export function CrudModal({ open, onClose, title, fields, initialData, onSave, onFormChange }: CrudModalProps) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const defaults: Record<string, any> = {};
      fields.forEach((f) => {
        if (initialData && initialData[f.name] !== undefined) {
          defaults[f.name] = initialData[f.name];
        } else if (f.defaultValue !== undefined) {
          defaults[f.name] = f.defaultValue;
        } else if (f.type === "switch") {
          defaults[f.name] = true;
        } else {
          defaults[f.name] = "";
        }
      });
      setForm(defaults);
      onFormChange?.(defaults);
      setErrors({});
    }
  }, [open, initialData]);

  const set = (name: string, value: any) => {
    setForm((p) => {
      const next = { ...p, [name]: value };
      onFormChange?.(next);
      return next;
    });
    setErrors((e) => { const n = { ...e }; delete n[name]; return n; });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    fields.forEach((f) => {
      const isVisible = !f.hidden && (!f.visibleWhen || f.visibleWhen(form));
      const isRequired = f.requiredWhen ? f.requiredWhen(form) : f.required;
      if (isRequired && isVisible && (form[f.name] === "" || form[f.name] === undefined || form[f.name] === null)) {
        errs[f.name] = "Campo obrigatório";
      }
    });
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    const cleanData: Record<string, any> = {};
    fields.forEach((f) => {
      if (!f.hidden) {
        let val = form[f.name];
        if (f.type === "number" && val !== "" && val !== undefined) val = Number(val);
        if (val === "" && !f.required) val = null;
        cleanData[f.name] = val;
      }
    });
    const ok = await onSave(cleanData);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {fields.filter(f => !f.hidden && (!f.visibleWhen || f.visibleWhen(form))).map((f) => (
            <div key={f.name} className={f.type === "switch" ? "flex items-center gap-3 md:col-span-2" : ""}>
              {f.type !== "switch" && (
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
                </label>
              )}

              {f.type === "text" && (
                <input
                  value={form[f.name] || ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  className={cn(
                    "w-full h-10 px-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
                    errors[f.name] ? "border-destructive" : "border-border",
                    "focus:border-primary focus:ring-1 focus:ring-primary/30"
                  )}
                />
              )}

              {f.type === "number" && (
                <input
                  type="number"
                  step={f.step || "any"}
                  value={form[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  className={cn(
                    "w-full h-10 px-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
                    errors[f.name] ? "border-destructive" : "border-border",
                    "focus:border-primary focus:ring-1 focus:ring-primary/30"
                  )}
                />
              )}

              {(f.type === "select" || f.type === "enum") && (
                <select
                  value={form[f.name] || ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  className={cn(
                    "w-full h-10 px-3 rounded-lg border bg-secondary/40 text-sm text-foreground outline-none transition-colors cursor-pointer",
                    errors[f.name] ? "border-destructive" : "border-border",
                    "focus:border-primary focus:ring-1 focus:ring-primary/30",
                    !form[f.name] && "text-muted-foreground"
                  )}
                >
                  <option value="">{f.placeholder || "Selecionar..."}</option>
                  {f.type === "enum" && f.enumValues?.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                  {f.type === "select" && f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}

              {f.type === "switch" && (
                <>
                  <Switch checked={!!form[f.name]} onCheckedChange={(v) => set(f.name, v)} />
                  <label className="text-sm text-foreground">{f.label}</label>
                </>
              )}

              {errors[f.name] && f.type !== "switch" && (
                <p className="flex items-center gap-1 mt-1 text-xs text-destructive">
                  <AlertCircle size={11} /> {errors[f.name]}
                </p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
