/**
 * Code 128 barcode generator (SVG path data)
 * Generates a visual representation of Code 128 barcodes
 */

// Code 128 B encoding table
const CODE128B: Record<string, number[]> = {
  ' ': [2,1,2,2,2,2], '!': [2,2,2,1,2,2], '"': [2,2,2,2,2,1],
  '#': [1,2,1,2,2,3], '$': [1,2,1,3,2,2], '%': [1,3,1,2,2,2],
  '&': [1,2,2,2,1,3], "'": [1,2,2,3,1,2], '(': [1,3,2,2,1,2],
  ')': [2,2,1,2,1,3], '*': [2,2,1,3,1,2], '+': [2,3,1,2,1,2],
  ',': [1,1,2,2,3,2], '-': [1,2,2,1,3,2], '.': [1,2,2,2,3,1],
  '/': [1,1,3,2,2,2], '0': [1,2,3,1,2,2], '1': [1,2,3,2,2,1],
  '2': [2,2,3,2,1,1], '3': [2,2,1,1,3,2], '4': [2,2,1,2,3,1],
  '5': [2,1,3,2,1,2], '6': [2,2,3,1,1,2], '7': [3,1,2,1,3,1],
  '8': [3,1,1,2,2,2], '9': [3,2,1,1,2,2], ':': [3,2,1,2,2,1],
  ';': [3,1,2,2,1,2], '<': [3,2,2,1,1,2], '=': [3,2,2,2,1,1],
  '>': [2,1,2,1,2,3], '?': [2,1,2,3,2,1], '@': [2,3,2,1,2,1],
  'A': [1,1,1,3,2,3], 'B': [1,3,1,1,2,3], 'C': [1,3,1,3,2,1],
  'D': [1,1,2,3,1,3], 'E': [1,3,2,1,1,3], 'F': [1,3,2,3,1,1],
  'G': [2,1,1,3,1,3], 'H': [2,3,1,1,1,3], 'I': [2,3,1,3,1,1],
  'J': [1,1,2,1,3,3], 'K': [1,1,2,3,3,1], 'L': [1,3,2,1,3,1],
  'M': [1,1,3,1,2,3], 'N': [1,1,3,3,2,1], 'O': [1,3,3,1,2,1],
  'P': [3,1,3,1,2,1], 'Q': [2,1,1,3,3,1], 'R': [2,3,1,1,3,1],
  'S': [2,1,3,1,1,3], 'T': [2,1,3,3,1,1], 'U': [2,1,3,1,3,1],
  'V': [3,1,1,1,2,3], 'W': [3,1,1,3,2,1], 'X': [3,3,1,1,2,1],
  'Y': [3,1,2,1,1,3], 'Z': [3,1,2,3,1,1], '[': [3,3,2,1,1,1],
  '\\': [3,1,4,1,1,1], ']': [2,2,1,4,1,1], '^': [4,3,1,1,1,1],
  '_': [1,1,1,2,2,4], '`': [1,1,1,4,2,2], 'a': [1,2,1,1,2,4],
  'b': [1,2,1,4,2,1], 'c': [1,4,1,1,2,2], 'd': [1,4,1,2,2,1],
  'e': [1,1,2,2,1,4], 'f': [1,1,2,4,1,2], 'g': [1,2,2,1,1,4],
  'h': [1,2,2,4,1,1], 'i': [1,4,2,1,1,2], 'j': [1,4,2,2,1,1],
  'k': [2,4,1,2,1,1], 'l': [2,2,1,1,1,4], 'm': [4,1,3,1,1,1],
  'n': [2,4,1,1,1,2], 'o': [1,3,4,1,1,1], 'p': [1,1,1,2,4,2],
  'q': [1,2,1,1,4,2], 'r': [1,2,1,2,4,1], 's': [1,1,4,2,1,2],
  't': [1,2,4,1,1,2], 'u': [1,2,4,2,1,1], 'v': [4,1,1,2,1,2],
  'w': [4,2,1,1,1,2], 'x': [4,2,1,2,1,1], 'y': [2,1,2,1,4,1],
  'z': [2,1,4,1,2,1], '{': [4,1,2,1,2,1], '|': [1,1,1,1,4,3],
  '}': [1,1,1,3,4,1], '~': [1,3,1,1,4,1],
};

// Start B, Stop patterns
const START_B = [2,1,1,4,1,2];
const STOP = [2,3,3,1,1,1,2];

// Value table for checksum
const VALUE_TABLE: Record<string, number> = {};
Object.keys(CODE128B).forEach((char, idx) => { VALUE_TABLE[char] = idx; });

export interface BarcodeBar {
  x: number;
  width: number;
  isBar: boolean;
}

export function generateCode128(text: string): BarcodeBar[] {
  const moduleWidth = 2; // pixels per module
  const bars: BarcodeBar[] = [];
  let x = 0;

  const addPattern = (pattern: number[]) => {
    pattern.forEach((width, idx) => {
      bars.push({ x, width: width * moduleWidth, isBar: idx % 2 === 0 });
      x += width * moduleWidth;
    });
  };

  // Start B
  addPattern(START_B);

  // Encode each character
  let checksum = 104; // Start B value
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const pattern = CODE128B[char];
    if (pattern) {
      addPattern(pattern);
      checksum += (VALUE_TABLE[char] ?? 0) * (i + 1);
    }
  }

  // Checksum character
  const checksumValue = checksum % 103;
  const checksumChar = Object.keys(CODE128B)[checksumValue];
  if (checksumChar && CODE128B[checksumChar]) {
    addPattern(CODE128B[checksumChar]);
  }

  // Stop
  addPattern(STOP);

  return bars;
}

export function getTotalWidth(bars: BarcodeBar[]): number {
  if (bars.length === 0) return 0;
  const last = bars[bars.length - 1];
  return last.x + last.width;
}
