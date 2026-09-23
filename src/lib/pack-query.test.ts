import { describe, expect, it } from "vitest";
import { parsePackSearchParams } from "./pack-query";

describe("pack query parsing", () => {
  it("accepts the documented filters", () => {
    expect(parsePackSearchParams({ q: "reshade", sort: "rating", known: "1", page: "3" })).toEqual({
      q: "reshade",
      sort: "rating",
      known: true,
      page: 3,
    });
  });

  it("falls back for malformed or repeated values", () => {
    expect(parsePackSearchParams({ sort: "invalid", page: "-2", known: "true", q: ["first", "second"] })).toEqual({
      q: "first",
      sort: "newest",
      known: false,
      page: 1,
    });
  });
});
