import { useState, useCallback } from "react";
import { parseError, type ParsedError } from "@/lib/errorMapper";
import type { ResultDialogProps } from "@/components/feedback/ResultDialog";

interface UseResultDialogOptions {
  coletorMode?: boolean;
}

interface ShowSuccessOptions {
  details?: string;
  confirmLabel?: string;
  onClose?: () => void;
}

interface ShowWarningOptions {
  details?: string;
  instruction?: string;
  confirmLabel?: string;
  onClose?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

interface ShowErrorOptions {
  context?: string;
  onClose?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

interface DialogState {
  open: boolean;
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
}

interface UseResultDialogReturn {
  dialogProps: ResultDialogProps;
  showSuccess: (title: string, options?: ShowSuccessOptions) => void;
  showWarning: (title: string, options?: ShowWarningOptions) => void;
  showError: (error: unknown, options?: ShowErrorOptions) => void;
  showParsedError: (parsed: ParsedError, options?: { onClose?: () => void }) => void;
  close: () => void;
  isOpen: boolean;
}

export function useResultDialog(options?: UseResultDialogOptions): UseResultDialogReturn {
  const coletorMode = options?.coletorMode ?? false;

  const [state, setState] = useState<DialogState>({
    open: false,
    type: "success",
    title: "",
  });

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const showSuccess = useCallback(
    (title: string, opts?: ShowSuccessOptions) => {
      setState({
        open: true,
        type: "success",
        title,
        details: opts?.details,
        confirmLabel: opts?.confirmLabel,
        onConfirm: opts?.onClose
          ? () => {
              close();
              opts.onClose?.();
            }
          : undefined,
      });
    },
    [close],
  );

  const showWarning = useCallback(
    (title: string, opts?: ShowWarningOptions) => {
      setState({
        open: true,
        type: "warning",
        title,
        details: opts?.details,
        instruction: opts?.instruction,
        confirmLabel: opts?.confirmLabel,
        onConfirm: opts?.onClose
          ? () => {
              close();
              opts.onClose?.();
            }
          : undefined,
        secondaryLabel: opts?.secondaryLabel,
        onSecondary: opts?.onSecondary
          ? () => {
              close();
              opts.onSecondary?.();
            }
          : undefined,
      });
    },
    [close],
  );

  const showError = useCallback(
    (error: unknown, opts?: ShowErrorOptions) => {
      const parsed = parseError(error, opts?.context);
      setState({
        open: true,
        type: "error",
        title: parsed.title,
        details: parsed.details,
        errorCode: parsed.errorCode,
        technicalMessage: parsed.technicalMessage,
        instruction: parsed.instruction,
        onConfirm: opts?.onClose
          ? () => {
              close();
              opts.onClose?.();
            }
          : undefined,
        secondaryLabel: opts?.secondaryLabel,
        onSecondary: opts?.onSecondary
          ? () => {
              close();
              opts.onSecondary?.();
            }
          : undefined,
      });
    },
    [close],
  );

  const showParsedError = useCallback(
    (parsed: ParsedError, opts?: { onClose?: () => void }) => {
      setState({
        open: true,
        type: "error",
        title: parsed.title,
        details: parsed.details,
        errorCode: parsed.errorCode,
        technicalMessage: parsed.technicalMessage,
        instruction: parsed.instruction,
        onConfirm: opts?.onClose
          ? () => {
              close();
              opts.onClose?.();
            }
          : undefined,
      });
    },
    [close],
  );

  const dialogProps: ResultDialogProps = {
    open: state.open,
    onClose: state.onConfirm ?? close,
    type: state.type,
    title: state.title,
    details: state.details,
    errorCode: state.errorCode,
    technicalMessage: state.technicalMessage,
    instruction: state.instruction,
    confirmLabel: state.confirmLabel,
    onConfirm: state.onConfirm,
    secondaryLabel: state.secondaryLabel,
    onSecondary: state.onSecondary,
    coletorMode,
  };

  return {
    dialogProps,
    showSuccess,
    showWarning,
    showError,
    showParsedError,
    close,
    isOpen: state.open,
  };
}
