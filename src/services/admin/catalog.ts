import { asc, count, eq } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export class CatalogError extends Error {
  constructor(
    readonly code: "validation" | "not_found" | "conflict",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

export type CategoryInput = {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  kind?: unknown;
  enabled?: unknown;
  sortOrder?: unknown;
};

export type TagInput = { slug?: unknown; name?: unknown };

const kinds = new Set<string>(s.packKind.enumValues);

function text(value: unknown, field: string, min: number, max: number): string {
  const clean = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (clean.length < min || clean.length > max) {
    throw new CatalogError("validation", `${field} ${min}-${max} karakter olmalı.`, 400);
  }
  return clean;
}

function slug(value: unknown): string {
  if (!isSafeSlug(value)) {
    throw new CatalogError("validation", "Slug küçük harfli kebab-case olmalı.", 400);
  }
  return value;
}

function constraintMessage(error: unknown): string {
  let current: unknown = error;
  const messages: string[] = [];
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (current instanceof Error) messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return messages.join(" ");
}

function mapConstraint(error: unknown): never {
  const detail = constraintMessage(error);
  if (detail.includes("unique") || detail.includes("duplicate key")) {
    throw new CatalogError("conflict", "Bu slug zaten kullanılıyor.", 409);
  }
  if (detail.includes("foreign key")) {
    throw new CatalogError("conflict", "Bağlı kayıtlar bulunduğu için silinemedi.", 409);
  }
  throw error;
}

function gate(actor: Actor, permission: "category.manage" | "tag.manage") {
  assertActive(actor);
  requirePermission(actor, permission);
  if (!actor.id) throw new CatalogError("validation", "Geçersiz aktör.", 400);
  return actor.id;
}

export async function listAdminCategories(db: Database, actor: Actor) {
  gate(actor, "category.manage");
  return db
    .select({
      id: s.packCategories.id,
      slug: s.packCategories.slug,
      name: s.packCategories.name,
      description: s.packCategories.description,
      kind: s.packCategories.kind,
      enabled: s.packCategories.enabled,
      sortOrder: s.packCategories.sortOrder,
      packCount: count(s.packs.id),
    })
    .from(s.packCategories)
    .leftJoin(s.packs, eq(s.packs.categoryId, s.packCategories.id))
    .groupBy(s.packCategories.id)
    .orderBy(asc(s.packCategories.sortOrder), asc(s.packCategories.name));
}

export async function createCategory(db: Database, actor: Actor, input: CategoryInput) {
  const actorId = gate(actor, "category.manage");
  if (!kinds.has(String(input.kind))) throw new CatalogError("validation", "Geçersiz kategori türü.", 400);
  const kind = input.kind as (typeof s.packKind.enumValues)[number];
  const values = {
    slug: slug(input.slug),
    name: text(input.name, "Kategori adı", 2, 80),
    description:
      input.description === undefined || input.description === null || input.description === ""
        ? null
        : text(input.description, "Açıklama", 2, 500),
    kind,
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    sortOrder:
      Number.isInteger(input.sortOrder) && Number(input.sortOrder) >= 0
        ? Math.min(10000, Number(input.sortOrder))
        : 0,
  };
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(s.packCategories).values(values).returning();
      if (!created) throw new Error("Category insert returned no row.");
      await tx.insert(s.auditLogs).values({
        actorId,
        action: "category.create",
        targetType: "pack_category",
        targetId: created.id,
        after: created,
      });
      return created;
    });
  } catch (error) {
    mapConstraint(error);
  }
}

export async function updateCategory(db: Database, actor: Actor, id: string, input: CategoryInput) {
  const actorId = gate(actor, "category.manage");
  const [before] = await db.select().from(s.packCategories).where(eq(s.packCategories.id, id));
  if (!before) throw new CatalogError("not_found", "Kategori bulunamadı.", 404);
  const patch: Partial<typeof s.packCategories.$inferInsert> = {};
  if (input.slug !== undefined) patch.slug = slug(input.slug);
  if (input.name !== undefined) patch.name = text(input.name, "Kategori adı", 2, 80);
  if (input.description !== undefined) {
    patch.description = input.description === null || input.description === "" ? null : text(input.description, "Açıklama", 2, 500);
  }
  if (input.kind !== undefined) {
    if (!kinds.has(String(input.kind))) throw new CatalogError("validation", "Geçersiz kategori türü.", 400);
    patch.kind = input.kind as (typeof s.packKind.enumValues)[number];
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") throw new CatalogError("validation", "enabled boolean olmalı.", 400);
    patch.enabled = input.enabled;
  }
  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder) || Number(input.sortOrder) < 0) throw new CatalogError("validation", "Sıra sıfır veya pozitif olmalı.", 400);
    patch.sortOrder = Math.min(10000, Number(input.sortOrder));
  }
  if (Object.keys(patch).length === 0) throw new CatalogError("validation", "Güncellenecek alan yok.", 400);
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(s.packCategories).set(patch).where(eq(s.packCategories.id, id)).returning();
      if (!updated) throw new CatalogError("not_found", "Kategori bulunamadı.", 404);
      await tx.insert(s.auditLogs).values({ actorId, action: "category.update", targetType: "pack_category", targetId: id, before, after: updated });
      return updated;
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    mapConstraint(error);
  }
}

export async function deleteCategory(db: Database, actor: Actor, id: string) {
  const actorId = gate(actor, "category.manage");
  try {
    return await db.transaction(async (tx) => {
      const [removed] = await tx.delete(s.packCategories).where(eq(s.packCategories.id, id)).returning();
      if (!removed) throw new CatalogError("not_found", "Kategori bulunamadı.", 404);
      await tx.insert(s.auditLogs).values({ actorId, action: "category.delete", targetType: "pack_category", targetId: id, before: removed });
      return removed;
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    mapConstraint(error);
  }
}

export async function listAdminTags(db: Database, actor: Actor) {
  gate(actor, "tag.manage");
  return db.select().from(s.tags).orderBy(asc(s.tags.name));
}

export async function createTag(db: Database, actor: Actor, input: TagInput) {
  const actorId = gate(actor, "tag.manage");
  const values = { slug: slug(input.slug), name: text(input.name, "Etiket adı", 1, 60) };
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(s.tags).values(values).returning();
      if (!created) throw new Error("Tag insert returned no row.");
      await tx.insert(s.auditLogs).values({ actorId, action: "tag.create", targetType: "tag", targetId: created.id, after: created });
      return created;
    });
  } catch (error) {
    mapConstraint(error);
  }
}

export async function updateTag(db: Database, actor: Actor, id: string, input: TagInput) {
  const actorId = gate(actor, "tag.manage");
  const [before] = await db.select().from(s.tags).where(eq(s.tags.id, id));
  if (!before) throw new CatalogError("not_found", "Etiket bulunamadı.", 404);
  const patch: Partial<typeof s.tags.$inferInsert> = {};
  if (input.slug !== undefined) patch.slug = slug(input.slug);
  if (input.name !== undefined) patch.name = text(input.name, "Etiket adı", 1, 60);
  if (Object.keys(patch).length === 0) throw new CatalogError("validation", "Güncellenecek alan yok.", 400);
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(s.tags).set(patch).where(eq(s.tags.id, id)).returning();
      if (!updated) throw new CatalogError("not_found", "Etiket bulunamadı.", 404);
      await tx.insert(s.auditLogs).values({ actorId, action: "tag.update", targetType: "tag", targetId: id, before, after: updated });
      return updated;
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    mapConstraint(error);
  }
}

export async function deleteTag(db: Database, actor: Actor, id: string) {
  const actorId = gate(actor, "tag.manage");
  return db.transaction(async (tx) => {
    const [removed] = await tx.delete(s.tags).where(eq(s.tags.id, id)).returning();
    if (!removed) throw new CatalogError("not_found", "Etiket bulunamadı.", 404);
    await tx.insert(s.auditLogs).values({ actorId, action: "tag.delete", targetType: "tag", targetId: id, before: removed });
    return removed;
  });
}
