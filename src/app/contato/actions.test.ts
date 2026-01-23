import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitContact } from "./actions";

// Mock the email module
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { sendEmail } from "@/lib/email";

describe("submitContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createFormData(data: Record<string, string>): FormData {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return formData;
  }

  it("returns validation errors for empty form", async () => {
    const formData = createFormData({
      name: "",
      email: "",
      subject: "",
      message: "",
    });

    const result = await submitContact(formData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.name).toBeDefined();
    expect(result.errors?.email).toBeDefined();
    expect(result.errors?.subject).toBeDefined();
    expect(result.errors?.message).toBeDefined();
  });

  it("returns validation error for invalid email", async () => {
    const formData = createFormData({
      name: "Test User",
      email: "invalid-email",
      subject: "Test Subject",
      message: "This is a test message",
    });

    const result = await submitContact(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.email).toBeDefined();
  });

  it("returns validation error for short name", async () => {
    const formData = createFormData({
      name: "A",
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a test message",
    });

    const result = await submitContact(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.name).toBeDefined();
  });

  it("sends email and returns success for valid data", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: true,
      messageId: "test-message-id",
    });

    const formData = createFormData({
      name: "Test User",
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a test message with enough characters",
    });

    const result = await submitContact(formData);

    expect(result.success).toBe(true);
    expect(result.message).toContain("sucesso");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[PPTNC] Contato: Test Subject",
        replyTo: "test@example.com",
      })
    );
  });

  it("returns error when email sending fails", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: false,
      error: "SMTP error",
    });

    const formData = createFormData({
      name: "Test User",
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a test message with enough characters",
    });

    const result = await submitContact(formData);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Erro");
  });

  it("includes timestamp in response", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: true,
      messageId: "test-id",
    });

    const formData = createFormData({
      name: "Test User",
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a test message with enough characters",
    });

    const result = await submitContact(formData);

    expect(result.timestamp).toBeDefined();
    expect(typeof result.timestamp).toBe("number");
  });
});
