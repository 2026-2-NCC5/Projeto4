/**
 * Cliente mínimo da API Gemini (generateContent) com saída JSON estruturada.
 * Nunca registra o texto enviado ou recebido; erros só carregam o código HTTP/tipo.
 */
export interface GeminiSettings {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GeminiJsonRequest {
  system: string;
  contents: GeminiMessage[];
  /** schema no formato OpenAPI aceito por responseSchema */
  schema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export class GeminiError extends Error {
  constructor(readonly reason: 'timeout' | 'http' | 'blocked' | 'invalid_response', readonly status?: number) {
    super(`gemini ${reason}${status ? ` ${status}` : ''}`);
    this.name = 'GeminiError';
  }
}

export interface JsonModelClient {
  readonly model: string;
  generateJson<T>(request: GeminiJsonRequest): Promise<T>;
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiClient implements JsonModelClient {
  constructor(
    private readonly settings: GeminiSettings,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get model(): string {
    return this.settings.model;
  }

  async generateJson<T>(request: GeminiJsonRequest): Promise<T> {
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: request.contents.map((message) => ({ role: message.role, parts: [{ text: message.text }] })),
      generationConfig: {
        temperature: request.temperature ?? 0.4,
        maxOutputTokens: request.maxOutputTokens ?? 1024,
        responseMimeType: 'application/json',
        responseSchema: request.schema,
        // resposta de voz precisa ser rápida: sem etapa de "raciocínio" estendido
        ...(this.settings.model.startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    let response: Response;
    try {
      response = await this.fetchImpl(`${ENDPOINT}/${encodeURIComponent(this.settings.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.settings.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new GeminiError('timeout');
      throw new GeminiError('http');
    }
    if (!response.ok) throw new GeminiError('http', response.status);
    const payload = (await response.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    } | null;
    if (payload?.promptFeedback?.blockReason) throw new GeminiError('blocked');
    const candidate = payload?.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') throw new GeminiError('blocked');
    const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GeminiError('invalid_response');
    }
  }
}
