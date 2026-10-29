import { describe, it, expect } from "vitest";
import {
  getGeminiConfig,
  getGeminiHealth,
  handleGeminiApiRoute,
  analyzeCaseWithGemini,
  generateDraftWithGemini,
} from "@/lib/gemini-server";
import { caseIntelligenceService } from "@/lib/case-intelligence";
import { afStore } from "@/lib/approval-flow";

describe("Gemini Server Integration & Diagnostic Endpoints", () => {
  it("resolves config safely and masks secrets", () => {
    const health = getGeminiHealth({
      GEMINI_API_KEY: "dummy-secret-key-12345",
      GEMINI_MODEL: "gemini-3.5-flash-lite",
    });

    expect(health.ok).toBe(true);
    expect(health.model).toBe("gemini-3.5-flash-lite");
    expect(health.keyConfigured).toBe(true);
    expect(health.keyPrefix).toBe("dumm...");
    // Crucial security check: Ensure raw key is never returned
    expect(JSON.stringify(health)).not.toContain("dummy-secret-key-12345");
  });

  it("handles empty or missing API keys gracefully in health endpoint", () => {
    const health = getGeminiHealth({
      GEMINI_API_KEY: "",
      GEMINI_MODEL: "gemini-3.5-flash-lite",
    });

    expect(health.ok).toBe(false);
    expect(health.keyConfigured).toBe(false);
    expect(health.keyPrefix).toBe("(none)");
  });

  it("routes /api/gemini/health via handleGeminiApiRoute", async () => {
    const req = new Request("http://localhost/api/gemini/health");
    const res = await handleGeminiApiRoute(req, {
      GEMINI_API_KEY: "test-key-mock",
      GEMINI_MODEL: "gemini-3.5-flash-lite",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; model: string; keyConfigured: boolean };
    expect(body.ok).toBe(true);
    expect(body.model).toBe("gemini-3.5-flash-lite");
    expect(body.keyConfigured).toBe(true);
  });

  it("returns 404 for unknown api routes", async () => {
    const req = new Request("http://localhost/api/gemini/unknown-endpoint");
    const res = await handleGeminiApiRoute(req);
    expect(res.status).toBe(404);
  });

  it("resolves environment from custom runtime env over process.env", () => {
    const customConfig = getGeminiConfig({
      GEMINI_API_KEY: "custom-nitro-env-key",
      GEMINI_MODEL: "gemini-custom-model",
    });
    expect(customConfig.apiKey).toBe("custom-nitro-env-key");
    expect(customConfig.model).toBe("gemini-custom-model");
  });

  // ── Opt-in Live Gemini Smoke Test ───────────────────────────────────────────
  // Run with: RUN_GEMINI_SMOKE_TEST=true npm run test:gemini
  const runLiveSmoke = process.env["RUN_GEMINI_SMOKE_TEST"] === "true";

  it.skipIf(!runLiveSmoke)(
    "performs live inference with Gemini LLM when explicitly enabled",
    async () => {
      const app = afStore.applications[0];
      if (!app) throw new Error("No application found for live smoke test");

      const context = caseIntelligenceService.buildContext(app.id);

      // 1. Live Case Analysis
      const intel = await analyzeCaseWithGemini(context);
      expect(intel).toBeDefined();
      expect(intel.providerMode).toBe("llm");
      expect(intel.summary.executiveNarrative.length).toBeGreaterThan(10);
      expect(intel.attention.factors.length).toBe(6);
      expect(Array.isArray(intel.recommendations)).toBe(true);
      expect(intel.recommendations.length).toBeGreaterThan(0);

      // 2. Live Communication Drafting
      const draft = await generateDraftWithGemini("OFFICER_SUMMARY", context);
      expect(draft).toBeDefined();
      expect(draft.subject.length).toBeGreaterThan(5);
      expect(draft.body.length).toBeGreaterThan(20);
    },
    60000,
  );
});
