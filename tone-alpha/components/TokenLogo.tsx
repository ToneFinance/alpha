interface TokenLogoProps {
  symbol: string;
  color: string;
  size?: "sm" | "md" | "lg";
}

export function TokenLogo({ symbol, color, size = "md" }: TokenLogoProps) {
  const sizeMap = {
    sm: { container: 40, fontSize: 12 },
    md: { container: 56, fontSize: 16 },
    lg: { container: 80, fontSize: 24 },
  };

  const { container, fontSize } = sizeMap[size];

  return (
    <div
      style={{
        width: container,
        height: container,
        borderRadius: "50%",
        backgroundColor: `${color}20`,
        border: `2px solid ${color}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: 600,
          color: color,
          lineHeight: 1,
          letterSpacing: "-0.5px",
        }}
      >
        {symbol}
      </span>
    </div>
  );
}
