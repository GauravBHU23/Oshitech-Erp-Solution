import { describe, expect, it } from "vitest";
import { dmyToIso, dobError, isValidPhone, isoToDmy, maskDmy } from "./validation";

describe("DD/MM/YYYY date helpers", () => {
  it("masks typed digits", () => {
    expect(maskDmy("1")).toBe("1");
    expect(maskDmy("1508")).toBe("15/08");
    expect(maskDmy("15082012")).toBe("15/08/2012");
    expect(maskDmy("15/08/2012999")).toBe("15/08/2012");
  });
  it("converts both ways and rejects impossible dates", () => {
    expect(dmyToIso("15/08/2012")).toBe("2012-08-15");
    expect(dmyToIso("31/02/2012")).toBe("");
    expect(dmyToIso("2012-08-15")).toBe("");
    expect(isoToDmy("2012-08-15")).toBe("15/08/2012");
  });
  it("explains date of birth problems", () => {
    expect(dobError("")).toMatch(/required/);
    expect(dobError("31/02/2012")).toMatch(/DD\/MM\/YYYY/);
    expect(dobError("01/01/2999")).toMatch(/future/);
    expect(dobError("15/08/2012")).toBe("");
  });
});

describe("mobile number", () => {
  it.each([
    ["9876543210", true],
    ["+91 9876543210", true],
    ["+91-9876543210", true],
    ["09876543210", true],
    ["5876543210", false],
    ["98765", false],
    ["98765432101", false],
  ])("%s -> %s", (value, ok) => expect(isValidPhone(value)).toBe(ok));
});

import { nameError } from "./validation";

describe("person names", () => {
  it.each([
    ["Riya", ""],
    ["रिया", ""],
    ["M. K. Gandhi", ""],
    ["O'Brien", ""],
    ["Anne-Marie", ""],
  ])("accepts %s", (value, expected) => expect(nameError(value)).toBe(expected));
  it.each(["R2D2", "a", "@@@", "123", " - "])("rejects %s", (value) => expect(nameError(value)).not.toBe(""));
  it("optional names may be blank", () => {
    expect(nameError("", false)).toBe("");
    expect(nameError("")).toMatch(/required/);
  });
});
