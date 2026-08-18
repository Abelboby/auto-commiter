import { ActiveModel, ConfiguredModel } from "./types";

interface GroqCallOptions {
  apiKey: string;
  modelId: string;
  promptText: string;
  temperature: number;
}

interface GroqResult {
  ok: boolean;
  text?: string;
  code?: number;
  error?: string;
}

interface GroqRequestBody {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_completion_tokens: number;
  reasoning_effort?: "low";
  reasoning_format?: "hidden";
}

export interface GenerationSettings {
  models: ConfiguredModel[];
  validTags: string[];
  maxWords: number;
  temperature: number;
}

export interface GeneratedMessage {
  text: string;
  isFallback: boolean;
  auditTrail: string[];
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function validateCommitMessage(message: string, validTags: string[], maxWords: number): boolean {
  const normalized = normalizeWhitespace(message);
  if (!normalized) {
    return false;
  }

  if (!validTags.some((tag) => normalized.startsWith(tag))) {
    return false;
  }

  return normalized.split(" ").length <= maxWords;
}

function normalizeCommitMessage(message: string | undefined, filePath: string, validTags: string[], maxWords: number): string {
  const fallback = `${validTags[1] ?? "Update:"} modify ${filePath}`;
  if (!message) {
    return fallback;
  }

  let normalized = normalizeWhitespace(message);
  if (!validTags.some((tag) => normalized.startsWith(tag))) {
    return fallback;
  }

  const words = normalized.split(" ");
  if (words.length > maxWords) {
    normalized = words.slice(0, maxWords).join(" ");
  }

  return normalized;
}

function isGptOssModel(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-oss-");
}

function buildGroqRequestBody(options: GroqCallOptions): GroqRequestBody {
  const body: GroqRequestBody = {
    model: options.modelId,
    messages: [
      {
        role: "system",
        content: "You write concise git commit messages. Return only the final commit message."
      },
      {
        role: "user",
        content: options.promptText
      }
    ],
    temperature: options.temperature,
    max_completion_tokens: 256
  };

  if (isGptOssModel(options.modelId)) {
    body.reasoning_effort = "low";
    body.reasoning_format = "hidden";
  }

  return body;
}

async function invokeGroqOnce(options: GroqCallOptions): Promise<GroqResult> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify(buildGroqRequestBody(options))
    });

    if (!response.ok) {
      return {
        ok: false,
        code: response.status,
        error: await response.text()
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return {
        ok: false,
        error: "Empty response from Groq."
      };
    }

    return {
      ok: true,
      text
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error)
    };
  }
}

function toActiveModels(models: ConfiguredModel[]): ActiveModel[] {
  return models
    .filter((model) => model.enabled && model.id.trim().length > 0 && model.maxCallsPerRun > 0)
    .sort((a, b) => (a.costOrder ?? Number.MAX_SAFE_INTEGER) - (b.costOrder ?? Number.MAX_SAFE_INTEGER))
    .map((model) => ({
      ...model,
      callsUsed: 0
    }));
}

export async function generateCommitMessage(input: {
  apiKey: string;
  filePath: string;
  promptContent: string;
  settings: GenerationSettings;
}): Promise<GeneratedMessage> {
  const models = toActiveModels(input.settings.models);
  if (models.length === 0) {
    throw new Error("No enabled Groq models are configured.");
  }

  const promptText = [
    "Generate ONE git commit message for this file change.",
    `Rules: max ${input.settings.maxWords} words, start with exactly one of: ${input.settings.validTags.join(", ")}`,
    "Output only the commit message, nothing else.",
    "",
    `File: ${input.filePath}`,
    "",
    "Diff:",
    input.promptContent
  ].join("\n");

  let lastCandidate: string | undefined;
  const auditTrail: string[] = [];

  for (const model of models) {
    if (model.callsUsed >= model.maxCallsPerRun) {
      continue;
    }

    model.callsUsed += 1;
    auditTrail.push(`Trying ${model.id} (${model.callsUsed}/${model.maxCallsPerRun})`);
    const result = await invokeGroqOnce({
      apiKey: input.apiKey,
      modelId: model.id,
      promptText,
      temperature: input.settings.temperature
    });

    if (result.ok && result.text) {
      lastCandidate = result.text;
      if (validateCommitMessage(result.text, input.settings.validTags, input.settings.maxWords)) {
        auditTrail.push(`Accepted response from ${model.id}`);
        return {
          text: normalizeCommitMessage(result.text, input.filePath, input.settings.validTags, input.settings.maxWords),
          isFallback: false,
          auditTrail
        };
      }

      auditTrail.push(`Rejected invalid response from ${model.id}: ${result.text}`);
      continue;
    }

    auditTrail.push(`Model ${model.id} failed${result.code ? ` (${result.code})` : ""}: ${result.error ?? "Unknown error"}`);
  }

  auditTrail.push("All models failed validation. Using normalized fallback.");
  return {
    text: normalizeCommitMessage(lastCandidate, input.filePath, input.settings.validTags, input.settings.maxWords),
    isFallback: true,
    auditTrail
  };
}
