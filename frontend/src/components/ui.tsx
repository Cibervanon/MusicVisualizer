import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { cn } from "../lib/utils";
import { useStudio } from "../store/studio";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden
    />
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "accent" | "ghost" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  variant = "ghost",
  size = "md",
  loading = false,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const variants = {
    primary: "btn-primary",
    accent: "btn-accent",
    ghost: "btn-ghost",
    quiet: "btn-quiet",
    danger: "btn-danger",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "",
    lg: "px-6 py-3.5 text-[15px]",
  };
  return (
    <button
      className={cn(variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  strong = false,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return <div className={cn(strong ? "glass-strong" : "glass", className)}>{children}</div>;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.04] text-white/65",
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    danger: "border-rose-400/25 bg-rose-400/10 text-rose-200",
    accent: "border-accent/30 bg-accent/10 text-violet-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = "lime",
  className,
  height = "h-2",
}: {
  value: number;
  tone?: "lime" | "accent" | "danger" | "white";
  className?: string;
  height?: string;
}) {
  const tones = {
    lime: "bg-gradient-to-r from-lime to-emerald-300",
    accent: "bg-gradient-to-r from-accent to-cyan",
    danger: "bg-gradient-to-r from-rose-500 to-orange-400",
    white: "bg-white/70",
  };
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-white/[0.07]", height, className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tones[tone])}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 168,
  stroke = 10,
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D6FF3D" />
            <stop offset="60%" stopColor="#7DE3A8" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label}
        {sublabel}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-lime/80">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[30px]">
          {title}
        </h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "glass-strong relative z-10 max-h-[90vh] w-full overflow-hidden",
          wide ? "max-w-6xl" : "max-w-2xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="text-sm font-semibold text-white">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-64px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ToastHost() {
  const toast = useStudio((state) => state.toast);
  const dismiss = useStudio((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, 5200);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  const tones = {
    success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
    error: "border-rose-400/30 bg-rose-500/15 text-rose-100",
    info: "border-white/15 bg-ink-800/95 text-white/85",
  };
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] w-[min(92vw,460px)] -translate-x-1/2 animate-rise">
      <div
        className={cn(
          "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl",
          tones[toast.kind],
        )}
      >
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-current" />
        <p className="flex-1 leading-snug">{toast.message}</p>
        <button onClick={dismiss} className="text-current/60 hover:text-current" aria-label="Cerrar">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-white/85">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition",
          checked ? "border-lime/40 bg-lime/80" : "border-white/15 bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
          style={{ height: 18, width: 18 }}
        />
      </span>
    </button>
  );
}

export function LabeledSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onFocus,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onFocus?: () => void;
  format?: (value: number) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-white/65">{label}</span>
        <span className="font-mono text-white/45">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60">
        {icon}
      </div>
      <p className="text-sm font-semibold text-white/85">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
