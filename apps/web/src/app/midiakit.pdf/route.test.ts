import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDownload = vi.fn();
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return { file: () => ({ download: mockDownload }) };
    }
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MEDIAKIT_BUCKET = "test-bucket";
});

describe("GET /midiakit.pdf", () => {
  it("serves the PDF with download headers and short cache", async () => {
    mockDownload.mockResolvedValue([Buffer.from("%PDF-fake")]);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="Midiakit-PPT-Nao-Compila.pdf"',
    );
    // Objeto estável sobrescrito diariamente → cache curto (retro-22 AI 10).
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await response.text()).toBe("%PDF-fake");
  });

  it("404 amigável quando o objeto ainda não foi publicado", async () => {
    mockDownload.mockRejectedValue(Object.assign(new Error("No such object"), { code: 404 }));
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("503 fechado sem bucket configurado ou em falha de download", async () => {
    delete process.env.MEDIAKIT_BUCKET;
    expect((await GET()).status).toBe(503);

    process.env.MEDIAKIT_BUCKET = "test-bucket";
    mockDownload.mockRejectedValue(new Error("network"));
    expect((await GET()).status).toBe(503);
  });
});
