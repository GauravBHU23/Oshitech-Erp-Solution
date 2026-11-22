import { describe, expect, it } from "vitest";
import { actionLabel, actionTone, changeLines, modelLabel } from "./audit";

describe("audit log labels", () => {
  it("labels actions and models", () => {
    expect(actionLabel("fee_invoices_generated")).toBe("Fee invoices generated");
    expect(actionLabel("some_new_action")).toBe("Some new action");
    expect(modelLabel("IDCard")).toBe("ID card");
    expect(modelLabel("FancyThing")).toBe("Fancy Thing");
  });
  it("colours actions", () => {
    expect(actionTone("delete")).toBe("red");
    expect(actionTone("account_blocked")).toBe("red");
    expect(actionTone("account_unblocked")).toBe("green");
    expect(actionTone("create")).toBe("green");
    expect(actionTone("update")).toBe("indigo");
    expect(actionTone("account_password_reset")).toBe("amber");
  });
  it("shows old -> new values and hides raw ids", () => {
    const lines = changeLines({ old: { phone: "9876543210", is_active: "True", classroom: "3f2b1c4d-1111-2222-3333-444455556666" }, new: { phone: "9123456780", is_active: "False", classroom: "aaaaaaaa-1111-2222-3333-444455556666" } });
    expect(lines).toContain("Phone: 9876543210 → 9123456780");
    expect(lines).toContain("Status: Yes → No");
    expect(lines).toContain("Classroom: (changed) → (changed)");
    expect(changeLines({ fields: ["first_name", "phone"] })).toEqual(["Changed: First name, Phone"]);
    expect(changeLines({ created: 5 })).toEqual(["Created: 5"]);
    expect(changeLines(null)).toEqual([]);
  });
});
