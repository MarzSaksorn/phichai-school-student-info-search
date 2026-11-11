import { describe, expect, it } from "vitest";
import { assertRole, type Actor } from "../../src/auth/roles.js";

describe("directory administrator roles", () => {
  it("allows an owner to perform every administrative action", () => {
    const owner: Actor = { id: "owner-1", role: "owner" };

    expect(() => assertRole(owner, "importer")).not.toThrow();
    expect(() => assertRole(owner, "publisher")).not.toThrow();
    expect(() => assertRole(owner, "operator")).not.toThrow();
    expect(() => assertRole(owner, "owner")).not.toThrow();
  });

  it("rejects a public actor and prevents an importer from publishing", () => {
    expect(() => assertRole({ id: "visitor", role: "public" }, "importer")).toThrow(
      "Administrator role required"
    );
    expect(() => assertRole({ id: "importer-1", role: "importer" }, "publisher")).toThrow(
      "Insufficient administrator role"
    );
  });
});
