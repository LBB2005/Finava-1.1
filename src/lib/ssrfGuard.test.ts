import { describe, it, expect, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookupMock(...a) }));

import { isPrivateIp, expandIpv6, resolvePinnedIp, pinnedLookup } from "./ssrfGuard";

describe("isPrivateIp", () => {
  it("flags IPv4 private / loopback / link-local / CGNAT ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it("allows public IPv4 (including just-outside-range boundaries)", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "140.82.112.3", "172.32.0.1", "100.63.0.1"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });

  it("flags IPv6 loopback/unspecified/ULA/link-local in every representation", () => {
    for (const ip of [
      "::1",
      "0:0:0:0:0:0:0:1", // fully-expanded loopback
      "0000:0000:0000:0000:0000:0000:0000:0001",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%eth0", // with zone id
      "::ffff:127.0.0.1", // dotted v4-mapped loopback
      "::ffff:7f00:1", // hex v4-mapped loopback — the bypass this fix closes
      "::ffff:0a00:0001", // hex v4-mapped 10.0.0.1
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it("allows public IPv6", () => {
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });

  it("treats unparseable colon-addresses as unsafe (fail closed)", () => {
    expect(isPrivateIp("1:2:3::4::5")).toBe(true);
    expect(isPrivateIp("nonsense:::")).toBe(true);
  });
});

describe("expandIpv6", () => {
  it("expands compressed forms to canonical 8-group hex", () => {
    expect(expandIpv6("::1")).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
    expect(expandIpv6("fe80::1")).toBe("fe80:0000:0000:0000:0000:0000:0000:0001");
    expect(expandIpv6("2606:4700:4700::1111")).toBe("2606:4700:4700:0000:0000:0000:0000:1111");
  });

  it("returns null for non-IPv6 / malformed input", () => {
    expect(expandIpv6("127.0.0.1")).toBeNull();
    expect(expandIpv6("1:2:3::4::5")).toBeNull();
    expect(expandIpv6("::ffff:127.0.0.1")).toBeNull(); // dotted form is not pure hex
  });
});

describe("resolvePinnedIp", () => {
  it("returns null when ANY resolved address is private (rebinding defense)", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 }, // one poisoned answer → refuse the whole name
    ]);
    await expect(resolvePinnedIp("rebind.evil")).resolves.toBeNull();
  });

  it("returns the first vetted public address to pin the socket to", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "140.82.112.3", family: 4 }]);
    await expect(resolvePinnedIp("github.com")).resolves.toEqual({
      address: "140.82.112.3",
      family: 4,
    });
  });

  it("refuses on resolution failure or empty answer", async () => {
    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(resolvePinnedIp("nope.invalid")).resolves.toBeNull();
    lookupMock.mockResolvedValueOnce([]);
    await expect(resolvePinnedIp("empty.example")).resolves.toBeNull();
  });
});

describe("pinnedLookup", () => {
  it("hands the socket the pinned IP under the single-address contract", () => {
    const cb = vi.fn();
    pinnedLookup({ address: "140.82.112.3", family: 4 })("ignored.host", {}, cb);
    expect(cb).toHaveBeenCalledWith(null, "140.82.112.3", 4);
  });

  it("returns an array under the all:true (Happy Eyeballs) contract", () => {
    const cb = vi.fn();
    pinnedLookup({ address: "2606:4700:4700::1111", family: 6 })(
      "ignored.host",
      { all: true },
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, [{ address: "2606:4700:4700::1111", family: 6 }]);
  });
});
