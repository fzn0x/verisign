import type { StampLayout } from "../../lib/stamp";

/**
 * The stamp as an SVG in PDF points, drawn from the same layout the PDF
 * writer uses, so what is placed is what gets printed.
 */
export function StampPreview({ layout }: { layout: StampLayout }) {
  const { width, height, padding, module, qr, lines } = layout;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" aria-hidden focusable="false" style={{ display: "block" }}>
      <rect x={0.25} y={0.25} width={width - 0.5} height={height - 0.5} fill="#fff" stroke="#cfcfcf" strokeWidth={0.5} />
      <path d={qr.path} fill="#111" transform={`translate(${padding} ${padding}) scale(${module})`} shapeRendering="crispEdges" />
      {lines.map((line, i) => (
        <text
          key={i}
          x={line.x}
          y={line.baseline}
          fontSize={line.size}
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight={line.bold ? 700 : 400}
          fill="#111"
        >
          {line.text}
        </text>
      ))}
    </svg>
  );
}
