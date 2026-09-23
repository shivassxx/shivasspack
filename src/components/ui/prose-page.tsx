export type ProseSection = {
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
};

export function ProsePage({
  eyebrow,
  title,
  description,
  updatedAt,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  sections: readonly ProseSection[];
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="border-b border-line pb-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent-400">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-2xl leading-7 text-zinc-400">{description}</p>
        <p className="mt-4 text-xs text-zinc-600">Son güncelleme: {updatedAt}</p>
      </header>
      <div className="space-y-9 py-8">
        {sections.map((section) => (
          <section key={section.title} aria-labelledby={`section-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <h2
              id={`section-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className="text-lg font-semibold text-white"
            >
              {section.title}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-400">
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items ? (
                <ul className="list-disc space-y-2 pl-5 marker:text-accent-500">
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
