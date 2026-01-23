import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to ensure mockSend is available during vi.mock hoisting
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

// Mock the resend module with a constructor function
vi.mock("resend", () => {
  // Create a constructor function that can be called with `new`
  function MockResend() {
    return {
      emails: {
        send: mockSend,
      },
    };
  }
  return { Resend: MockResend };
});

// Import after mocking
import { sendEmail, EMAIL_CONFIG } from "./resend";

describe("sendEmail", () => {
  const originalEnv = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalEnv;
  });

  it("should send email successfully", async () => {
    mockSend.mockResolvedValueOnce({
      data: { id: "msg_123" },
      error: null,
    });

    const result = await sendEmail({
      subject: "Test Subject",
      html: "<p>Test content</p>",
      text: "Test content",
      replyTo: "user@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("msg_123");
    expect(result.error).toBeUndefined();
    expect(mockSend).toHaveBeenCalledWith({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject: "Test Subject",
      html: "<p>Test content</p>",
      text: "Test content",
      replyTo: "user@example.com",
    });
  });

  it("should handle Resend API errors", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid API key" },
    });

    const result = await sendEmail({
      subject: "Test",
      html: "<p>Test</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid API key");
    expect(result.messageId).toBeUndefined();
  });

  it("should handle exceptions", async () => {
    mockSend.mockRejectedValueOnce(new Error("Network error"));

    const result = await sendEmail({
      subject: "Test",
      html: "<p>Test</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("should return error when API key is not configured", async () => {
    process.env.RESEND_API_KEY = "";

    const result = await sendEmail({
      subject: "Test",
      html: "<p>Test</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Email service is not configured");
  });

  it("should send email without optional fields", async () => {
    mockSend.mockResolvedValueOnce({
      data: { id: "msg_456" },
      error: null,
    });

    const result = await sendEmail({
      subject: "Minimal email",
      html: "<p>Content</p>",
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject: "Minimal email",
      html: "<p>Content</p>",
      text: undefined,
      replyTo: undefined,
    });
  });
});

describe("EMAIL_CONFIG", () => {
  it("should have correct from address", () => {
    expect(EMAIL_CONFIG.from).toBe("PPTNC <contato@pptnaocompila.com.br>");
  });

  it("should have correct to address", () => {
    expect(EMAIL_CONFIG.to).toBe("podcast@pptnaocompila.com.br");
  });
});
