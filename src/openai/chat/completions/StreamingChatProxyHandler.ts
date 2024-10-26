import { generateContent } from "../../../gemini-api-client/gemini-api-client.ts"
import { resultHelper } from "../../../gemini-api-client/response-helper.ts"
import type { FunctionCall } from "../../../gemini-api-client/types.ts"
import type { Logger } from "../../../log.ts"
import type { OpenAI } from "../../../types.ts"
import { type ApiParam, genModel } from "../../../utils.ts"
import { calculatePromptTokens } from "./prompt.ts"

export function streamingChatProxyHandler(
  req: OpenAI.Chat.ChatCompletionCreateParams,
  apiParam: ApiParam,
  log?: Logger,
): Response {
  const [model, geminiReq] = genModel(req)
  log?.debug("streamGenerateContent request", req)
  return sseResponse(
    (async function* () {
      for await (const it of generateContent("streamGenerateContent", apiParam, model, geminiReq)) {
        log?.debug("streamGenerateContent resp", it)
        const data = resultHelper(it)
        yield genStreamResp({ model: req.model, content: data, stop: false, request: req })
      }
      if (!req.stream_options?.include_usage){
        yield genStreamResp({ model: req.model, content: "", stop: true, request: req })
      } else {
        yield genStreamResp({ 
          model: req.model, 
          content: "",
          stop: true,
          request: req
        })
      }
      yield "[DONE]"
      return undefined
    })(),
  )
}

function genStreamResp({
  model,
  content,
  stop,
  request,
}: { model: string; content: string | FunctionCall; stop: boolean, request: OpenAI.Chat.ChatCompletionCreateParams }
): OpenAI.Chat.ChatCompletionChunk {
  if (typeof content === "string") {
    return {
      id: "chatcmpl-abc123",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          delta: { role: "assistant", content },
          finish_reason: stop ? "stop" : null,
          index: 0,
        },
      ],
      usage: !request?.stream_options?.include_usage ? undefined : {
        prompt_tokens: calculatePromptTokens(request.messages),
        completion_tokens: content.length,
        total_tokens: calculatePromptTokens(request.messages) + content.length,
      }
    } satisfies OpenAI.Chat.ChatCompletionChunk
  }

  return {
    id: "chatcmpl-abc123",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        delta: { role: "assistant", function_call: content },
        finish_reason: stop ? "function_call" : null,
        index: 0,
      },
    ],
    usage: !request?.stream_options?.include_usage ? undefined : {
      prompt_tokens: calculatePromptTokens(request.messages),
      completion_tokens: 0,
      total_tokens: calculatePromptTokens(request.messages),
    }
} satisfies OpenAI.Chat.ChatCompletionChunk
}

const encoder = new TextEncoder()

function sseResponse(dataStream: AsyncGenerator<string | OpenAI.Chat.ChatCompletionChunk, undefined>): Response {
  const s = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await dataStream.next()
      if (done) {
        controller.close()
      } else {
        const data = typeof value === "string" ? value : JSON.stringify(value)
        controller.enqueue(encoder.encode(toSseMsg({ data })))
      }
    },
  })

  const response = new Response(s, {
    status: 200,
    headers: new Headers({
      "Content-Type": "text/event-stream",
    }),
  })

  return response
}

export function toSseMsg({ event, data, id }: SseEvent) {
  let result = `data: ${data}\n`
  if (event) {
    result += `event: ${event ?? ""}\n`
  }
  if (id) {
    result += `id: ${id ?? ""}\n`
  }
  return `${result}\n`
}

export interface SseEvent {
  event?: string
  id?: string
  data: string
}
