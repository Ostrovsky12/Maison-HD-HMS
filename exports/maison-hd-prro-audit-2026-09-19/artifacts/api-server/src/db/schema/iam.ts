/**
 * IAM DOMAIN
 * Identity & Access Management: users, roles, permissions, RBAC
 *
 * Architecture: Attribute-Based Access Control (ABAC) layered on RBAC.
 *   tenant → roles → permissions
 *   user   → roles (within tenant context)
 *   user   → direct permission overrides
 */

import {
  pgTable, serial, text, boolean, integer,
  timestamp, jsonb, unique, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";

// ─── ROLES ────────────────────────────────────────────────────────────────────
// System roles (tenant_id = NULL) + tenant-specific custom roles.
export const roles = pgTable("roles", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),         // "super_admin" | "owner" | "manager" | "reception" | "housekeeping"
  displayName: text("display_name").notNull(),
  description: text("description"),
  isSystem:    boolean("is_system").notNull().default(false), // cannot be deleted
  isActive:    boolean("is_active").notNull().default(true),
  sortOrder:   integer("sort_order").default(0),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniq:        unique().on(t.tenantId, t.name),
}));

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────
// Granular permission catalog: resource + action + scope.
// Examples: { resource: "bookings", action: "create", scope: "own_property" }
export const permissions = pgTable("permissions", {
  id:          serial("id").primaryKey(),
  resource:    text("resource").notNull(),   // "bookings" | "guests" | "rates" | "reports" ...
  action:      text("action").notNull(),     // "create" | "read" | "update" | "delete" | "export"
  scope:       text("scope").default("tenant"), // "tenant" | "property" | "own_only"
  displayName: text("display_name").notNull(),
  module:      text("module").notNull(),     // which product module this belongs to
  isActive:    boolean("is_active").notNull().default(true),
}, (t) => ({
  uniq:        unique().on(t.resource, t.action, t.scope),
}));

// ─── ROLE PERMISSIONS ─────────────────────────────────────────────────────────
export const rolePermissions = pgTable("role_permissions", {
  id:           serial("id").primaryKey(),
  roleId:       integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  grantedAt:    timestamp("granted_at").notNull().defaultNow(),
  grantedBy:    integer("granted_by"),
}, (t) => ({
  uniq:         unique().on(t.roleId, t.permissionId),
  idxRole:      index("idx_role_permissions_role").on(t.roleId),
}));

// ─── USERS ────────────────────────────────────────────────────────────────────
// Core user account. One user can belong to one tenant.
// Cross-tenant access managed via super_admin role.
export const users = pgTable("users", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("organization_id").references(() => tenants.id),
  email:          text("email").notNull().unique(),
  name:           text("name").notNull(),
  passwordHash:   text("password_hash").notNull(),
  role:           text("role").notNull().default("reception"), // legacy enum field
  propertyId:     integer("property_id"),
  phone:          text("phone"),
  avatarUrl:      text("avatar_url"),
  locale:         text("locale").default("uk"),
  isActive:       boolean("is_active").notNull().default(true),
  lastLoginAt:    timestamp("last_login_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

// ─── USER ROLES ───────────────────────────────────────────────────────────────
// Many-to-many: user → role (within a tenant + optionally scoped to property)
export const userRoles = pgTable("user_roles", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId:      integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  tenantId:    integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  propertyId:  integer("property_id"),     // null = all properties
  grantedAt:   timestamp("granted_at").notNull().defaultNow(),
  grantedBy:   integer("granted_by").references(() => users.id),
  expiresAt:   timestamp("expires_at"),
}, (t) => ({
  uniq:        unique().on(t.userId, t.roleId, t.propertyId),
  idxUser:     index("idx_user_roles_user").on(t.userId),
  idxTenant:   index("idx_user_roles_tenant").on(t.tenantId),
}));

// ─── USER PERMISSION OVERRIDES ────────────────────────────────────────────────
// Direct permission grants or denies that override role defaults.
export const userPermissions = pgTable("user_permissions", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  granted:      boolean("granted").notNull().default(true), // false = explicit deny
  grantedAt:    timestamp("granted_at").notNull().defaultNow(),
  grantedBy:    integer("granted_by").references(() => users.id),
  expiresAt:    timestamp("expires_at"),
}, (t) => ({
  uniq:         unique().on(t.userId, t.permissionId),
  idxUser:      index("idx_user_permissions_user").on(t.userId),
}));
