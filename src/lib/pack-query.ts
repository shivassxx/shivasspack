import { packSortValues, type PackSort, type PublicPackFilters } from "@/services/packs/public";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export function parsePackSearchParams(params: Record<string, SearchValue>): PublicPackFilters {
  const q = first(params.q);
  const sortInput = first(params.sort);
  const sort = packSortValues.includes(sortInput as PackSort) ? (sortInput as PackSort) : "newest";
  const pageInput = Number(first(params.page));
  return {
    q,
    sort,
    known: first(params.known) === "1",
    page: Number.isInteger(pageInput) && pageInput > 0 ? pageInput : 1,
  };
}
