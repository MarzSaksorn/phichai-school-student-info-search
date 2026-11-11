export type AdministratorRole = "importer" | "publisher" | "operator" | "owner";
export type ActorRole = AdministratorRole | "public";

export type Actor = {
  id: string;
  role: ActorRole;
};

const permissions: Record<AdministratorRole, ReadonlySet<AdministratorRole>> = {
  importer: new Set(["importer"]),
  publisher: new Set(["importer", "publisher"]),
  operator: new Set(["operator"]),
  owner: new Set(["importer", "publisher", "operator", "owner"])
};

export function assertRole(actor: Actor, required: AdministratorRole): void {
  if (actor.role === "public") {
    throw new Error("Administrator role required");
  }
  if (!permissions[actor.role].has(required)) {
    throw new Error("Insufficient administrator role");
  }
}

export function assertAdministrator(actor: Actor): void {
  if (actor.role === "public") {
    throw new Error("Administrator role required");
  }
}

export function auditActorRole(actor: Actor): { actorRole: AdministratorRole } | Record<never, never> {
  return actor.role === "public" ? {} : { actorRole: actor.role };
}
