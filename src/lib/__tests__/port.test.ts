import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { resolvePreferredPort } from "../port.js";

describe("resolvePreferredPort", () => {
  const originalEnv = process.env.PROMPTERY_PORT;

  beforeEach(() => {
    delete process.env.PROMPTERY_PORT;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PROMPTERY_PORT;
    else process.env.PROMPTERY_PORT = originalEnv;
  });

  it("returns the CLI port with fallback when env is unset", () => {
    expect(resolvePreferredPort(4321)).toEqual({ port: 4321, exact: false });
  });

  it("defaults to 4321 when CLI port and env are both unset", () => {
    expect(resolvePreferredPort()).toEqual({ port: 4321, exact: false });
  });

  it("honours PROMPTERY_PORT as exact — takes precedence over CLI", () => {
    process.env.PROMPTERY_PORT = "4322";
    expect(resolvePreferredPort(4321)).toEqual({ port: 4322, exact: true });
  });

  it("treats whitespace-only env as unset", () => {
    process.env.PROMPTERY_PORT = "   ";
    expect(resolvePreferredPort(4321)).toEqual({ port: 4321, exact: false });
  });

  it("rejects non-numeric env values", () => {
    process.env.PROMPTERY_PORT = "not-a-port";
    expect(() => resolvePreferredPort()).toThrow(/Invalid PROMPTERY_PORT/);
  });

  it("rejects ports outside 0-65535", () => {
    process.env.PROMPTERY_PORT = "70000";
    expect(() => resolvePreferredPort()).toThrow(/Invalid PROMPTERY_PORT/);
  });

  it("rejects negative ports", () => {
    process.env.PROMPTERY_PORT = "-1";
    expect(() => resolvePreferredPort()).toThrow(/Invalid PROMPTERY_PORT/);
  });
});
