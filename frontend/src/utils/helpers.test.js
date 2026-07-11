// Pure-function unit tests for frontend utils (run in node env, no DOM needed).
import { describe, it, expect } from "vitest";
import {
  cn,
  getDistanceFromLatLonInMeters,
  getInitials,
  getStatusColor,
} from "../utils/helpers.js";

describe("cn", () => {
  it("joins truthy class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("filters out falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("supports conditional objects", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });
});

describe("getDistanceFromLatLonInMeters", () => {
  it("returns ~0 for identical coords", () => {
    expect(
      getDistanceFromLatLonInMeters(28.6139, 77.209, 28.6139, 77.209),
    ).toBeLessThan(1);
  });
  it("computes ~distance between two known points", () => {
    const d = getDistanceFromLatLonInMeters(28.6139, 77.209, 28.6149, 77.209);
    // ~111 m per 0.001 deg latitude
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(140);
  });
  it("flags points outside a radius", () => {
    const d = getDistanceFromLatLonInMeters(28.6139, 77.209, 28.6229, 77.209); // ~1 km north
    expect(d).toBeGreaterThan(900);
  });
});

describe("getInitials", () => {
  it("builds initials from first + last name", () => {
    expect(getInitials("Ada", "Lovelace")).toBe("AL");
  });
  it("handles single name", () => {
    expect(getInitials("Madonna")).toBe("M");
  });
  it("handles empty input", () => {
    expect(getInitials()).toBe("");
  });
});

describe("getStatusColor", () => {
  it("maps known statuses to tailwind theme classes", () => {
    expect(getStatusColor("present")).toContain("success");
    expect(getStatusColor("late")).toContain("warning");
    expect(getStatusColor("absent")).toContain("danger");
    expect(getStatusColor("excused")).toContain("brand");
  });
  it("falls back for unknown status", () => {
    expect(getStatusColor("weird")).toBe("bg-gray-100 text-gray-700");
  });
});
