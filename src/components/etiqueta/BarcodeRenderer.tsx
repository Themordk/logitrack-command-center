/**
 * Barcode Renderer using JsBarcode
 * Renders Code128 barcodes as SVG with fixed dimensions for thermal printing
 */
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeRendererProps {
  value: string;
  moduleWidth: number;
  height: number;
  margin: number;
  /** Rendered at exact pixel dimensions – no CSS scaling */
  maxWidth?: number;
}

export function BarcodeRenderer({
  value,
  moduleWidth,
  height,
  margin,
  maxWidth,
}: BarcodeRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: moduleWidth,
        height,
        margin,
        displayValue: false,
        lineColor: "#000000",
        background: "#FFFFFF",
        flat: true,
      });
    } catch (e) {
      console.error("Barcode generation error:", e);
    }
  }, [value, moduleWidth, height, margin]);

  if (!value) return null;

  return (
    <div
      style={{
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        maxWidth: maxWidth ? `${maxWidth}px` : undefined,
      }}
    >
      <svg ref={svgRef} style={{ display: "block" }} />
    </div>
  );
}

/**
 * Vertical barcode – physically rotated SVG (no CSS transform)
 */
export function BarcodeRendererVertical({
  value,
  moduleWidth,
  height,
  margin,
}: BarcodeRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: moduleWidth,
        height,
        margin,
        displayValue: false,
        lineColor: "#000000",
        background: "#FFFFFF",
        flat: true,
      });
    } catch (e) {
      console.error("Barcode generation error:", e);
    }
  }, [value, moduleWidth, height, margin]);

  if (!value) return null;

  return (
    <div
      style={{
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(90deg)",
        transformOrigin: "center center",
      }}
    >
      <svg ref={svgRef} style={{ display: "block" }} />
    </div>
  );
}
