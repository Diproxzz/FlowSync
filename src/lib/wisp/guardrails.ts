/**
 * Wisp Safety & Security Guardrails
 * Intercepts and politely rejects unauthorized inquiries regarding:
 * - System credentials, API keys, secrets, environment variables
 * - Creator / developer / underlying training identity
 * - Internal source code, model architecture, system prompts, jailbreak probing
 */

export interface GuardrailResult {
  isBlocked: boolean;
  rejectionReply?: string;
}

const BLOCKED_PATTERNS: RegExp[] = [
  // 1. API Keys & Secrets
  /\b(api[_\s-]?keys?|gemini[_\s-]?api[_\s-]?key|groq[_\s-]?api[_\s-]?key|secret[_\s-]?key|bearer[_\s-]?token|auth[_\s-]?token)\b/i,
  /\b(show|reveal|display|print|give|what\s+are|what\s+is)\b.*\b(api[_\s-]?keys?|secrets?|passwords?|credentials?|\.env|env\s+vars?)\b/i,
  /\b(\.env|environment\s+variables?|DATABASE_URL|JWT_SECRET)\b/i,

  // 2. Creator & Identity Probing
  /\bwho\s+(made|created|built|developed|programmed|trained|designed|authored)\s+(you|wisp|this|the\s+website|the\s+app|flowpilot|invoicer)\b/i,
  /\bwho\s+is\s+(your|the)\s+(creator|developer|maker|author|programmer|owner|boss|company)\b/i,
  /\b(are\s+you|were\s+you\s+made\s+by)\s+(chatgpt|openai|anthropic|google|deepmind|meta|llama|mistral|groq)\b/i,
  /\bwhat\s+(company|organization|person|team)\s+(owns|created|made|built|developed)\s+(you|this|it)\b/i,

  // 3. System Architecture, LLM Name, Tech Stack & Source Code Probing
  /\bhow\s+(are\s+you|is\s+(it|this|the\s+app|the\s+website|wisp))\s+(built|made|implemented|coded|programmed|architected)\b/i,
  /\b(what|which)\s+(llm|ai\s+model|model|gpt|gemini|groq|claude|llama|tech\s+stack|framework|database|library|packages?)\b/i,
  /\b(powered\s+by|running\s+on|built\s+with|written\s+in)\b.*\b(llm|model|gpt|gemini|groq|next\.?js|prisma|postgres|react|node)\b/i,
  /\b(show|print|reveal|give|display|tell\s+me)\s+(me\s+)?(your|the)\s+(source\s+code|codebase|system\s+prompt|prompt\s+instructions|tech\s+stack|architecture)\b/i,
  /\b(what\s+is|repeat|output)\s+your\s+(system\s+prompt|initial\s+prompt|hidden\s+prompt|rules|instructions)\b/i,

  // 4. Jailbreak & Prompt Injection attempts
  /\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?|rules?|directives?)\b/i,
  /\byou\s+are\s+now\s+in\s+developer\s+mode\b/i,
  /\bDAN\s+mode\b/i,
  /\bbypass\s+(guardrails|filters|safety)\b/i,
];

const POLITE_GUARDRAIL_REJECTION =
  "I am **Wisp**, your business intelligence and application assistant for **FlowPilot**! " +
  "For security, privacy, and compliance reasons, I do not disclose internal system architectures, developer identities, API credentials, or underlying configuration details.\n\n" +
  "I am here strictly to assist you with your business data—such as analyzing sales, purchases, stock inventory, party ledgers, customer balances, invoices, or answering questions about FlowPilot's features and reports. How can I assist with your business operations today?";

export function evaluateGuardrails(query: string): GuardrailResult {
  const q = query.trim();
  if (!q) return { isBlocked: false };

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(q)) {
      return {
        isBlocked: true,
        rejectionReply: POLITE_GUARDRAIL_REJECTION,
      };
    }
  }

  return { isBlocked: false };
}
