import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";

/** A real product screenshot in a minimal browser window, swapping with the theme. */
export function BrowserFrame({
  url,
  light,
  dark,
  alt,
  eager = false,
  className,
}: {
  url: string;
  light: StaticImageData;
  dark: StaticImageData;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  const sizes = "(min-width: 1280px) 1152px, 100vw";
  const loading = eager ? "eager" : "lazy";
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-2xl shadow-primary/10 ring-1 ring-black/5 dark:shadow-black/40 dark:ring-white/5",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-3 border-b bg-muted/60 px-3.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto w-full max-w-sm truncate rounded-md bg-background/80 px-3 py-0.5 text-center font-mono text-[11px] text-muted-foreground">
          {url}
        </div>
        <div className="w-10" aria-hidden />
      </div>
      <Image src={light} alt={alt} sizes={sizes} loading={loading} placeholder="blur" className="block w-full dark:hidden" />
      <Image src={dark} alt={alt} sizes={sizes} loading={loading} placeholder="blur" className="hidden w-full dark:block" />
    </figure>
  );
}
