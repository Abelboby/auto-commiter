"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCommitMessage = generateCommitMessage;
function normalizeWhitespace(input) {
    return input.replace(/\s+/g, " ").trim();
}
function validateCommitMessage(message, validTags, maxWords) {
    const normalized = normalizeWhitespace(message);
    if (!normalized) {
        return false;
    }
    if (!validTags.some((tag) => normalized.startsWith(tag))) {
        return false;
    }
    return normalized.split(" ").length <= maxWords;
}
function normalizeCommitMessage(message, filePath, validTags, maxWords) {
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
async function invokeGroqOnce(options) {
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${options.apiKey}`
            },
            body: JSON.stringify({
                model: options.modelId,
                messages: [
                    {
                        role: "system",
                        content: "You write concise git commit messages."
                    },
                    {
                        role: "user",
                        content: options.promptText
                    }
                ],
                temperature: options.temperature,
                max_tokens: 64
            })
        });
        if (!response.ok) {
            return {
                ok: false,
                code: response.status,
                error: await response.text()
            };
        }
        const payload = (await response.json());
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
    }
    catch (error) {
        return {
            ok: false,
            error: String(error)
        };
    }
}
function toActiveModels(models) {
    return models
        .filter((model) => model.enabled && model.id.trim().length > 0 && model.maxCallsPerRun > 0)
        .sort((a, b) => (a.costOrder ?? Number.MAX_SAFE_INTEGER) - (b.costOrder ?? Number.MAX_SAFE_INTEGER))
        .map((model) => ({
        ...model,
        callsUsed: 0
    }));
}
async function generateCommitMessage(input) {
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
    let lastCandidate;
    const auditTrail = [];
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
//# sourceMappingURL=groq.js.map