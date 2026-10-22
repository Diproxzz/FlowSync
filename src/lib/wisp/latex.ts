/**
 * Utility to convert raw LaTeX math syntax produced by LLMs
 * into clean, plain, human-readable text and formulas.
 */
export function formatLatexFormulas(text: string): string {
  if (!text) return "";

  let cleaned = text;

  // 1. Replace \text{...}, \mathrm{...}, \mathbf{...} FIRST so nested braces in fractions don't block matching
  while (/\\(?:text|mathrm|mathbf|mathit)\{([^{}]+)\}/.test(cleaned)) {
    cleaned = cleaned.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^{}]+)\}/g, "$1");
  }

  // 2. Replace fractions: \frac{a}{b} -> (a / b)
  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(cleaned)) {
    cleaned = cleaned.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1 / $2)");
  }

  // 3. Replace common math symbols with standard readable symbols
  cleaned = cleaned
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\le(q)?\b/g, "≤")
    .replace(/\\ge(q)?\b/g, "≥")
    .replace(/\\neq\b/g, "≠")
    .replace(/\\approx\b/g, "≈")
    .replace(/\\left\(/g, "(")
    .replace(/\\right\)/g, ")")
    .replace(/\\left\[/g, "[")
    .replace(/\\right\]/g, "]")
    .replace(/\\left\{/g, "{")
    .replace(/\\right\}/g, "}")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_");

  // 4. Remove $$ formula fences and isolated $ math markers
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  cleaned = cleaned.replace(/\$([^$\n]+)\$/g, "$1");
  cleaned = cleaned.replace(/\$\$/g, "");

  // 5. Clean up any remaining backslashes before commands
  cleaned = cleaned.replace(/\\([a-zA-Z]+)/g, "$1");

  return cleaned.trim();
}
