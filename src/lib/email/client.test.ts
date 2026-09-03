import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailContent } from "./templates";

const deps = vi.hoisted(() => ({
  send: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: deps.send };
    constructor(key: string) {
      deps.ctor(key);
    }
  },
}));

/** Import fresh so module-level FROM/REPLY_TO and the client singleton are re-read. */
async function loadClient(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.stubEnv("RESEND_API_KEY", env.RESEND_API_KEY);
  vi.stubEnv("EMAIL_FROM", env.EMAIL_FROM);
  vi.stubEnv("EMAIL_REPLY_TO", env.EMAIL_REPLY_TO);
  return import("./client");
}

const content: EmailContent = {
  subject: "Welcome to Finava",
  html: "<p>hi</p>",
  text: "hi",
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.send.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isEmailEnabled", () => {
  it("is true only when RESEND_API_KEY is set", async () => {
    expect((await loadClient({ RESEND_API_KEY: "re_x" })).isEmailEnabled()).toBe(true);
    expect((await loadClient({})).isEmailEnabled()).toBe(false);
  });
});

describe("sendEmail", () => {
  it("sends via Resend and returns the message id", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    await expect(sendEmail("a@b.com", content)).resolves.toEqual({ sent: true, id: "msg_1" });
    expect(deps.ctor).toHaveBeenCalledWith("re_x");
    expect(deps.send).toHaveBeenCalledWith({
      from: "Finava <hello@finava.ai>",
      to: "a@b.com",
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  });

  it("accepts a list of recipients", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    await sendEmail(["a@b.com", "c@d.com"], content);
    expect(deps.send.mock.calls[0][0].to).toEqual(["a@b.com", "c@d.com"]);
  });

  it("honours EMAIL_FROM and adds replyTo only when configured", async () => {
    const { sendEmail } = await loadClient({
      RESEND_API_KEY: "re_x",
      EMAIL_FROM: "Finava <team@finava.ai>",
      EMAIL_REPLY_TO: "support@finava.ai",
    });
    await sendEmail("a@b.com", content);
    expect(deps.send.mock.calls[0][0]).toMatchObject({
      from: "Finava <team@finava.ai>",
      replyTo: "support@finava.ai",
    });
  });

  it("omits replyTo when EMAIL_REPLY_TO is unset", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    await sendEmail("a@b.com", content);
    expect(deps.send.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  it("reuses one Resend client across sends", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    await sendEmail("a@b.com", content);
    await sendEmail("c@d.com", content);
    expect(deps.ctor).toHaveBeenCalledTimes(1);
  });

  it("skips (never throws) when no key is configured, so signups keep working", async () => {
    const { sendEmail } = await loadClient({});
    await expect(sendEmail("a@b.com", content)).resolves.toEqual({ sent: false, skipped: true });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("reports a provider-returned error without throwing", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    deps.send.mockResolvedValueOnce({ data: null, error: { message: "domain not verified" } });
    await expect(sendEmail("a@b.com", content)).resolves.toEqual({
      sent: false,
      error: "domain not verified",
    });
  });

  it("catches a thrown network error", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    deps.send.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(sendEmail("a@b.com", content)).resolves.toEqual({
      sent: false,
      error: "ECONNRESET",
    });
  });

  it("labels a non-Error rejection 'unknown'", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    deps.send.mockRejectedValueOnce("boom");
    await expect(sendEmail("a@b.com", content)).resolves.toEqual({ sent: false, error: "unknown" });
  });

  it("reports sent:true even when the provider returns no id", async () => {
    const { sendEmail } = await loadClient({ RESEND_API_KEY: "re_x" });
    deps.send.mockResolvedValueOnce({ data: null, error: null });
    await expect(sendEmail("a@b.com", content)).resolves.toEqual({ sent: true, id: undefined });
  });
});
