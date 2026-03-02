/**
 * QR Code Renderer using qrcode-generator
 * Produces a real scannable QR code as SVG
 */
import { useMemo } from "react";
import qrcode from "qrcode-generator";

interface QRCodeRendererProps {
  value: string;
  size: number;
  margin?: number;
}

export function QRCodeRenderer({ value, size, margin = 2 }: QRCodeRendererProps) {
  const svgMarkup = useMemo(() => {
    if (!value) return "";
    try {
      const qr = qrcode(0, "M");
      qr.addData(value);
      qr.make();

      const moduleCount = qr.getModuleCount();
      const cellSize = (size - margin * 2) / moduleCount;
      
      let paths = "";
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            const x = margin + col * cellSize;
            const y = margin + row * cellSize;
            paths += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#000000"/>`;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#FFFFFF"/>${paths}</svg>`;
    } catch (e) {
      console.error("QR Code generation error:", e);
      return "";
    }
  }, [value, size, margin]);

  if (!svgMarkup) return null;

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        background: "#FFFFFF",
      }}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}
