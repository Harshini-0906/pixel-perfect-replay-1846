// ApprovalFlow AI — Server-Side Google Gemini LLM Integration
// Uses official Google Gen AI SDK (@google/genai)
// Reads GEMINI_API_KEY and GEMINI_MODEL exclusively on the server.
// Compatible with Nitro serverless runtime (env object) and Node (process.env).

import { GoogleGenAI } from "@google/genai";
import {
  type CaseIntelligenceContext,
  type CaseIntelligenceResult,
  type CommunicationDraft,
  type CommunicationDraftType,
  type DetectedIssue,
  type RecommendedAction,
  type AttentionAssessment,
  type ExecutiveCaseSummary,
  RuleBasedCaseIntelligenceProvider,
} from "./case-intelligence";
import {
  computeSlaStatus,
  isOverdue,
  stageAgeingDays,
  getTemplateStages,
  getAllowedNextStages,
  STAGE_TRANSITIONS,
  APP_TYPE_LABELS,
  STAGE_LABELS,
  type Stage,
} from "./approval-flow";

// ── Environment Resolution (Nitro & Node Compatible) ─────────────────────────

export interface GeminiServerConfig {
  apiKey: string;
  model: string;
  isConfigured: boolean;
}

let cachedNitroEnv: Record<string, string> | null = null;

export function setNitroServerEnv(env: unknown): void {
  if (env && typeof env === "object") {
    cachedNitroEnv = env as Record<string, string>;
  }
}

export function getGeminiConfig(env?: unknown): GeminiServerConfig {
  const nitro = (env && typeof env === "object" ? env : cachedNitroEnv) as Record<
    string,
    string
  > | null;
  const proc = typeof process !== "undefined" && process.env ? process.env : {};

  let rawApiKey: string | undefined;
  let rawModel: string | undefined;

  if (env && typeof env === "object") {
    const e = env as Record<string, string>;
    if ("GEMINI_API_KEY" in e) rawApiKey = e["GEMINI_API_KEY"];
    if ("GEMINI_MODEL" in e) rawModel = e["GEMINI_MODEL"];
  }

  if (rawApiKey === undefined && nitro) {
    if ("GEMINI_API_KEY" in nitro) rawApiKey = nitro["GEMINI_API_KEY"];
    if ("GEMINI_MODEL" in nitro) rawModel = nitro["GEMINI_MODEL"];
  }

  if (rawApiKey === undefined) {
    rawApiKey = proc["GEMINI_API_KEY"];
  }
  if (rawModel === undefined) {
    rawModel = proc["GEMINI_MODEL"];
  }

  const apiKey = (rawApiKey || "").trim();
  const model = (rawModel || "gemini-3.5-flash-lite").trim();

  return {
    apiKey,
    model,
    isConfigured: apiKey.length > 0,
  };
}

// ── Diagnostics & Safe Health Monitoring ──────────────────────────────────────

interface HealthState {
  lastChecked: string;
  lastRequestStatus: "success" | "error" | "none";
  lastErrorMessage?: string | undefined;
}

const healthState: HealthState = {
  lastChecked: new Date().toISOString(),
  lastRequestStatus: "none",
};

export function getGeminiHealth(env?: unknown) {
  const config = getGeminiConfig(env);
  return {
    ok: config.isConfigured,
    configured: config.isConfigured,
    keyConfigured: config.isConfigured,
    keyPrefix: config.apiKey ? `${config.apiKey.slice(0, 4)}...` : "(none)",
    model: config.model,
    status: config.isConfigured ? "ready" : "not_configured",
    lastChecked: healthState.lastChecked,
    lastRequestStatus: healthState.lastRequestStatus,
    lastErrorMessage: healthState.lastErrorMessage,
    timestamp: new Date().toISOString(),
  };
}

// ── Throttling & In-Memory Rate Limiting ───────────────────────────────────────

const requestLog: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 60;

function checkRateLimit(): boolean {
  const now = Date.now();
  // Retain only requests from the last 60 seconds
  while (requestLog.length > 0 && requestLog[0]! < now - 60000) {
    requestLog.shift();
  }
  if (requestLog.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  requestLog.push(now);
  return true;
}

async function callGeminiWithRetry(
  ai: GoogleGenAI,
  params: Parameters<typeof ai.models.generateContent>[0],
  maxRetries = 2,
) {
  let attempt = 0;
  while (true) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: unknown) {
      attempt++;
      const errMsg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      const isTransient =
        errMsg.includes("503") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED");
      if (isTransient && attempt <= maxRetries) {
        const delay = attempt * 1200;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// ── Fallback Provider Singleton ──────────────────────────────────────────────

const ruleBasedFallback = new RuleBasedCaseIntelligenceProvider();

// ── Real Gemini Case Analysis ────────────────────────────────────────────────

export async function analyzeCaseWithGemini(
  context: CaseIntelligenceContext,
  env?: unknown,
): Promise<CaseIntelligenceResult> {
  const config = getGeminiConfig(env);

  // If no Gemini key is configured, immediately return deterministic rule-based result
  if (!config.isConfigured) {
    return await ruleBasedFallback.analyzeCase(context);
  }

  // Check rate limit
  if (!checkRateLimit()) {
    healthState.lastRequestStatus = "error";
    healthState.lastErrorMessage = "Request rate limit exceeded. Using rule-based fallback.";
    const fallbackResult = await ruleBasedFallback.analyzeCase(context);
    fallbackResult.providerName = "Rule-Based Engine (Rate Limit Fallback)";
    return fallbackResult;
  }

  const {
    application: app,
    institutionName,
    institutionAicteId,
    institutionState,
    documents,
    tasks,
    auditLogs,
    undertakings,
    trackedDocuments,
  } = context;

  // 1. Gather Verified Empirical Facts (Deterministic Ground Truth)
  const sla = computeSlaStatus(app, app.currentStage);
  const overdue = isOverdue(app);
  const ageing = stageAgeingDays(app);
  const templateStages = getTemplateStages(app.workflowTemplate);
  const allowedNextStages = (STAGE_TRANSITIONS[app.currentStage] ?? []).filter((s) =>
    templateStages.includes(s),
  );

  const openDeficiencies = tasks
    .filter((t) => t.type === "Deficiency" && t.status !== "Resolved" && t.status !== "Closed")
    .map((t) => ({ id: t.id, title: t.description, dueDate: t.dueDate }));

  const unverifiedDocs = documents
    .filter((d) => !d.verified)
    .map((d) => ({ id: d.id, fileName: d.fileName, type: d.type, flags: d.flags ?? [] }));

  const expiredDocs = trackedDocuments
    .filter((td) => td.status === "Expired" || td.status === "Expiring Soon")
    .map((td) => ({
      id: td.id,
      name: td.documentName,
      status: td.status,
      expiryDate: td.expiryDate,
    }));

  const pendingUndertakings = undertakings
    .filter((u) => u.status === "Overdue" || u.status === "Under Review" || u.status === "Pending")
    .map((u) => ({
      id: u.id,
      title: u.title,
      condition: u.conditionDescription,
      status: u.status,
      dueDate: u.dueDate,
    }));

  const recentObservations = auditLogs
    .filter((l) => l.remarks && l.remarks.trim().length > 0)
    .slice(0, 3)
    .map((l) => ({ officer: l.userId, note: l.remarks }));

  // 2. Build Minimized, Sanitized LLM Prompt
  const promptPayload = {
    task: "ANALYZE_REGULATORY_APPLICATION",
    application: {
      id: app.id,
      institution: institutionName,
      aicteId: institutionAicteId,
      state: institutionState,
      category: APP_TYPE_LABELS[app.appType] || app.appType,
      currentStage: STAGE_LABELS[app.currentStage] || app.currentStage,
      slaStatus: sla.status,
      daysRemainingOrOverdue: sla.daysRemaining,
      stageAgeingDays: ageing ?? 0,
      assignedOfficer: app.assignedTo ?? "Unassigned",
      workflowTemplate: app.workflowTemplate,
      permittedNextStages: allowedNextStages.map((s) => ({
        stageKey: s,
        stageLabel: STAGE_LABELS[s],
      })),
    },
    factualEvidence: {
      unverifiedDocuments: unverifiedDocs,
      openDeficiencies,
      statutoryCertificates: expiredDocs,
      postApprovalUndertakings: pendingUndertakings,
      recentOfficerNotes: recentObservations,
    },
    instructions: [
      "You are an AI Decision-Support Analyst for the AICTE ApprovalFlow system.",
      "Analyze the application and provide a concise executive case summary.",
      "Evaluate operational attention tier: CRITICAL, HIGH_ATTENTION, MODERATE, or ON_TRACK, with composite score 0-100.",
      "Synthesize explanations for each factual issue and recommend next administrative actions.",
      "CRITICAL RULE: DO NOT INVENT fake documents, fake audit records, fake deadlines, or fake stages.",
      "All recommended stage transitions MUST be chosen strictly from the provided 'permittedNextStages'.",
      "Return valid JSON matching the requested structure.",
    ],
  };

  try {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const response = await callGeminiWithRetry(ai, {
      model: config.model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Analyze the following regulatory case context and output a JSON response conforming to the schema.\n" +
                JSON.stringify(promptPayload),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2, // Low temperature for high factual grounding
      },
    });

    const responseText = response.text?.trim() || "";
    if (!responseText) {
      throw new Error("Empty response received from Gemini API");
    }

    const parsed = JSON.parse(responseText) as {
      executiveNarrative?: string;
      attentionTier?: "CRITICAL" | "HIGH_ATTENTION" | "MODERATE" | "ON_TRACK";
      attentionScore?: number;
      attentionSummary?: string;
      issueExplanations?: Array<{
        issueTitle: string;
        explanation: string;
        suggestedAction: string;
      }>;
      recommendations?: Array<{
        title: string;
        actionType: string;
        targetStage?: string;
        rationale: string;
        supportingEvidence: string;
        requiredRole: string;
        priority: "HIGH" | "MEDIUM" | "LOW";
      }>;
    };

    // 3. Merge Grounded Source Facts with Gemini's AI Interpretations
    const baseResult = await ruleBasedFallback.analyzeCase(context);

    // AI Narrative
    const executiveNarrative =
      parsed.executiveNarrative && parsed.executiveNarrative.length > 20
        ? parsed.executiveNarrative
        : baseResult.summary.executiveNarrative;

    // AI Attention Assessment
    const tier = parsed.attentionTier || baseResult.attention.tier;
    const score =
      typeof parsed.attentionScore === "number" &&
      parsed.attentionScore >= 0 &&
      parsed.attentionScore <= 100
        ? parsed.attentionScore
        : baseResult.attention.score;
    const attentionSummary = parsed.attentionSummary || baseResult.attention.summary;

    const attention: AttentionAssessment = {
      tier,
      score,
      summary: attentionSummary,
      factors: baseResult.attention.factors, // Grounded empirical factors
      disclaimer: `Analysis synthesized by Google Gemini (${config.model}) with verified factual grounding. Advisory decision-support only.`,
    };

    // AI Issues: Enhance rule-based issues with Gemini's detailed explanation if provided
    const issues: DetectedIssue[] = baseResult.issues.map((baseIssue, idx) => {
      const aiExp = parsed.issueExplanations?.[idx];
      return {
        ...baseIssue,
        explanation: aiExp?.explanation || baseIssue.explanation,
        suggestedAction: aiExp?.suggestedAction || baseIssue.suggestedAction,
        isFact: baseIssue.isFact, // Preserves factual integrity
      };
    });

    // AI Recommendations: Validate stage transition targets against allowedNextStages
    const recommendations: RecommendedAction[] = [];

    const VALID_ACTION_TYPES: readonly string[] = [
      "stage_transition",
      "verify_evidence",
      "raise_deficiency",
      "schedule_evc",
      "request_clarification",
      "send_reminder",
      "review_document",
    ];

    if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
      parsed.recommendations.forEach((rec, idx) => {
        let targetStage: Stage | undefined = undefined;
        if (rec.targetStage && allowedNextStages.includes(rec.targetStage as Stage)) {
          targetStage = rec.targetStage as Stage;
        }

        const validActionType: RecommendedAction["actionType"] = VALID_ACTION_TYPES.includes(
          rec.actionType,
        )
          ? (rec.actionType as RecommendedAction["actionType"])
          : targetStage
            ? "stage_transition"
            : "review_document";

        recommendations.push({
          id: `REC-GEMINI-${app.id}-${idx + 1}`,
          title: rec.title || "Administrative Review Action",
          actionType: validActionType,
          ...(targetStage ? { targetStage } : {}),
          rationale: rec.rationale || "Recommended per regulatory evaluation",
          supportingEvidence:
            rec.supportingEvidence || `Ground truth context: Application ${app.id}`,
          requiredRole: rec.requiredRole || "scrutiny_officer",
          priority: rec.priority || "HIGH",
          requiresHumanConfirmation: true,
        });
      });
    }

    // If Gemini produced no valid recommendations, use the deterministic baseline recommendations
    const finalRecommendations =
      recommendations.length > 0 ? recommendations : baseResult.recommendations;

    const summary: ExecutiveCaseSummary = {
      ...baseResult.summary,
      executiveNarrative,
      generatedAt: new Date().toISOString(),
    };

    healthState.lastChecked = new Date().toISOString();
    healthState.lastRequestStatus = "success";
    delete healthState.lastErrorMessage;

    return {
      summary,
      attention,
      issues,
      recommendations: finalRecommendations,
      providerMode: "llm",
      providerName: `Gemini Live (${config.model})`,
      generatedAt: new Date().toISOString(),
      humanInTheLoopNotice:
        "Advisory Decision Support System: AI and heuristic agents do not possess statutory authority to approve, reject, or modify application stages. All recommendations require verification and execution by authorized council officers.",
    };
  } catch (err) {
    // Graceful Fallback: Log safe status, never expose API key or throw uncaught error
    const errMsg = err instanceof Error ? err.message : String(err);
    healthState.lastChecked = new Date().toISOString();
    healthState.lastRequestStatus = "error";
    healthState.lastErrorMessage = errMsg;

    const fallbackResult = await ruleBasedFallback.analyzeCase(context);
    fallbackResult.providerName = `Deterministic Heuristics Engine (Fallback: ${errMsg.slice(0, 40)}...)`;
    return fallbackResult;
  }
}

// ── Real Gemini Communication Drafting ───────────────────────────────────────

export async function generateDraftWithGemini(
  type: CommunicationDraftType,
  context: CaseIntelligenceContext,
  customInstructions?: string,
  env?: unknown,
): Promise<CommunicationDraft> {
  const config = getGeminiConfig(env);

  if (!config.isConfigured) {
    return await ruleBasedFallback.generateDraft(type, context, customInstructions);
  }

  const { application: app, institutionName, institutionAicteId } = context;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const refNo = `AICTE/APF/${app.region}/${app.id}/${now.getFullYear()}`;

  const prompt = {
    task: "DRAFT_OFFICIAL_COMMUNICATION",
    correspondenceType: type,
    referenceNo: refNo,
    date: dateStr,
    institution: {
      name: institutionName,
      aicteId: institutionAicteId,
      region: app.region,
    },
    application: {
      id: app.id,
      stage: STAGE_LABELS[app.currentStage],
      slaDeadline: app.slaDeadline,
    },
    customOfficerNotes: customInstructions || "None provided",
    instructions: [
      "Draft formal official correspondence from AICTE in standard Indian administrative format.",
      "Include complete Salutation, Subject Line, Body with pointwise observations, and Official Sign-off.",
      "Tone must be authoritative, courteous, and precise.",
      "Output JSON with keys: subject, body, recipient, title, recommendedChannels.",
    ],
  };

  try {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const response = await callGeminiWithRetry(ai, {
      model: config.model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Draft the following official regulatory correspondence as structured JSON:\n" +
                JSON.stringify(prompt),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    const responseText = response.text?.trim() || "";
    const parsed = JSON.parse(responseText) as {
      subject?: string;
      body?: string;
      title?: string;
      recipient?: string;
      recommendedChannels?: string[];
    };

    if (!parsed.body || !parsed.subject) {
      throw new Error("Invalid draft structure returned from Gemini");
    }

    healthState.lastChecked = new Date().toISOString();
    healthState.lastRequestStatus = "success";

    return {
      type,
      title: parsed.title || `Official ${type.replace(/_/g, " ")}`,
      recipient: parsed.recipient || `${institutionName} (${institutionAicteId})`,
      referenceNo: refNo,
      date: dateStr,
      subject: parsed.subject,
      body: parsed.body,
      recommendedChannels: parsed.recommendedChannels || [
        "Portal Notification",
        "Registered Email",
      ],
      isEditable: true,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    healthState.lastChecked = new Date().toISOString();
    healthState.lastRequestStatus = "error";
    healthState.lastErrorMessage = errMsg;

    return await ruleBasedFallback.generateDraft(type, context, customInstructions);
  }
}

// ── HTTP API Route Handler (For Nitro & Vite Dev Server) ──────────────────────

export async function handleGeminiApiRoute(request: Request, env?: unknown): Promise<Response> {
  const url = new URL(request.url);

  // Health endpoint
  if (url.pathname === "/api/gemini/health" && request.method === "GET") {
    const health = getGeminiHealth(env);
    return new Response(JSON.stringify(health), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // Analyze endpoint
  if (url.pathname === "/api/gemini/analyze" && request.method === "POST") {
    try {
      const body = (await request.json()) as { context: CaseIntelligenceContext };
      if (!body?.context?.application?.id) {
        return new Response(
          JSON.stringify({ error: "Missing required application context in request" }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }

      const result = await analyzeCaseWithGemini(body.context, env);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Failed to process case analysis",
          message: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  }

  // Draft endpoint
  if (url.pathname === "/api/gemini/draft" && request.method === "POST") {
    try {
      const body = (await request.json()) as {
        type: CommunicationDraftType;
        context: CaseIntelligenceContext;
        customInstructions?: string;
      };

      if (!body?.type || !body?.context?.application?.id) {
        return new Response(JSON.stringify({ error: "Missing draft type or context" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const draft = await generateDraftWithGemini(
        body.type,
        body.context,
        body.customInstructions,
        env,
      );
      return new Response(JSON.stringify(draft), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Failed to generate communication draft",
          message: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  }

  return new Response(JSON.stringify({ error: "Endpoint not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
