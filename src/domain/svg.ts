/** Keep only inert SVG: strips scripts, foreign content, event handlers and external links. */
export function sanitizeSvg(raw: string): string | null {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0];
  svg = svg.replace(/<(script|foreignObject|image|iframe|style)[\s\S]*?<\/\1\s*>/gi, "");
  svg = svg.replace(/<(script|foreignObject|image|iframe|style)\b[^>]*\/>/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  svg = svg.replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
  svg = svg.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none");
  if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg.length <= 24_000 ? svg : null;
}
