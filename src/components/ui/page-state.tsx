export function PageState({
  code,
  title,
  description,
  children,
}: {
  code: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-accent-400">{code}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">{description}</p>
      {children ? <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div> : null}
    </section>
  );
}

export const primaryActionClass =
  "inline-flex items-center justify-center rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500";

export const secondaryActionClass =
  "inline-flex items-center justify-center rounded-md border border-line bg-surface-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-line-strong hover:text-white";
