import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitSuggestion } from "./actions";

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

describe("submitSuggestion", () => {
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

  const validData = {
    name: "Test User",
    email: "test@example.com",
    type: "pauta",
    title: "Test Suggestion Title",
    description: "This is a detailed description with enough characters",
    linkedinUrl: "",
  };

  it("returns validation errors for empty form", async () => {
    const formData = createFormData({
      name: "",
      email: "",
      type: "",
      title: "",
      description: "",
      linkedinUrl: "",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.name).toBeDefined();
    expect(result.errors?.email).toBeDefined();
    expect(result.errors?.type).toBeDefined();
    expect(result.errors?.title).toBeDefined();
    expect(result.errors?.description).toBeDefined();
  });

  it("returns validation error for invalid email", async () => {
    const formData = createFormData({
      ...validData,
      email: "invalid-email",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.email).toBeDefined();
  });

  it("returns validation error for short name", async () => {
    const formData = createFormData({
      ...validData,
      name: "A",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.name).toBeDefined();
  });

  it("returns validation error for short title", async () => {
    const formData = createFormData({
      ...validData,
      title: "Hi",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.title).toBeDefined();
  });

  it("returns validation error for short description", async () => {
    const formData = createFormData({
      ...validData,
      description: "Too short",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.description).toBeDefined();
  });

  it("returns validation error for invalid type", async () => {
    const formData = createFormData({
      ...validData,
      type: "invalid",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.type).toBeDefined();
  });

  it("returns validation error for invalid linkedinUrl", async () => {
    const formData = createFormData({
      ...validData,
      linkedinUrl: "not-a-url",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.errors?.linkedinUrl).toBeDefined();
  });

  it("accepts valid linkedinUrl", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: true,
      messageId: "test-id",
    });

    const formData = createFormData({
      ...validData,
      linkedinUrl: "https://linkedin.com/in/testuser",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(true);
  });

  it("sends email and returns success for valid pauta data", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: true,
      messageId: "test-message-id",
    });

    const formData = createFormData(validData);

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(true);
    expect(result.message).toContain("sucesso");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[PPTNC] Nova sugestão de pauta: Test Suggestion Title",
        replyTo: "test@example.com",
      })
    );
  });

  it("sends email with correct subject for convidado type", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: true,
      messageId: "test-id",
    });

    const formData = createFormData({
      ...validData,
      type: "convidado",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[PPTNC] Nova sugestão de convidado: Test Suggestion Title",
      })
    );
  });

  it("sends email with correct subject for ambos type", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: true,
      messageId: "test-id",
    });

    const formData = createFormData({
      ...validData,
      type: "ambos",
    });

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject:
          "[PPTNC] Nova sugestão de pauta e convidado: Test Suggestion Title",
      })
    );
  });

  it("returns error when email sending fails", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: false,
      error: "SMTP error",
    });

    const formData = createFormData(validData);

    const result = await submitSuggestion(formData);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Erro");
  });

  it("includes timestamp in response", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      success: true,
      messageId: "test-id",
    });

    const formData = createFormData(validData);

    const result = await submitSuggestion(formData);

    expect(result.timestamp).toBeDefined();
    expect(typeof result.timestamp).toBe("number");
  });
});
