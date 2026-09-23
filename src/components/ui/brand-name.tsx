export function BrandName({ name }: { name: string }) {
  const split = name.lastIndexOf(" ");
  if (split < 0) return name;
  return <>{name.slice(0, split)} <span className="text-accent-500">{name.slice(split + 1)}</span></>;
}
