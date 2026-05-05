interface BrandProps {
  href?: string;
}

export function Brand({ href = "/" }: BrandProps) {
  return (
    <a href={href} className="brand-header" aria-label="trefolio accounts">
      <img
        src="/trefolio-icon.svg"
        alt=""
        width={40}
        height={40}
        className="brand-mark"
      />
      <span className="brand-name">trefolio</span>
    </a>
  );
}

export type AppKey = "trefolio" | "clara" | "will";

const APP_ICON: Record<AppKey, string> = {
  trefolio: "/trefolio-icon.svg",
  clara: "/clara-icon.png",
  will: "/will-icon.png",
};

const APP_LABEL: Record<AppKey, string> = {
  trefolio: "trefolio",
  clara: "Clara",
  will: "Will",
};

export function appKeyFromHint(hint: string | undefined | null): AppKey {
  const h = (hint || "").toLowerCase();
  if (h === "clara") return "clara";
  if (h === "will") return "will";
  return "trefolio";
}

interface AppIconProps {
  app: AppKey;
  size?: number;
  className?: string;
}

export function AppIcon({ app, size = 28, className }: AppIconProps) {
  return (
    <img
      src={APP_ICON[app]}
      alt={APP_LABEL[app]}
      width={size}
      height={size}
      className={className ?? "app-icon"}
    />
  );
}

export function appLabel(app: AppKey): string {
  return APP_LABEL[app];
}

export function PageFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="page-footer">
      <span>&copy; {year} trefolio</span>
      <span className="footer-sep">·</span>
      <a href="https://trefolio.com/privacy" target="_blank" rel="noopener noreferrer">
        Privacy
      </a>
      <span className="footer-sep">·</span>
      <a href="https://trefolio.com/terms" target="_blank" rel="noopener noreferrer">
        Terms
      </a>
      <span className="footer-sep">·</span>
      <a href="https://trefolio.com/contact" target="_blank" rel="noopener noreferrer">
        Contact
      </a>
    </footer>
  );
}
