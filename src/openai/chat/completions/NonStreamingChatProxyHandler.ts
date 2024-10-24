import { calculatePromptTokens } from "./prompt.ts"
import { generateContent } from "../../../gemini-api-client/gemini-api-client.ts"
import { resultHelper } from "../../../gemini-api-client/response-helper.ts"
import type { FunctionCall } from "../../../gemini-api-client/types.ts"
import type { Logger } from "../../../log.ts"
import type { OpenAI } from "../../../types.ts"
import { type ApiParam, genModel } from "../../../utils.ts"


export async function nonStreamingChatProxyHandler(
  req: OpenAI.Chat.ChatCompletionCreateParams,
  apiParam: ApiParam,
  log?: Logger,
): Promise<Response> {
  const [model, geminiReq] = genModel(req)
  let geminiResp: string | FunctionCall = ""

  // 异常时直接返回异常
  for await (const it of generateContent("streamGenerateContent", apiParam, model, geminiReq)) {
    const data = resultHelper(it)
    if (typeof data === "string") {
      geminiResp += data
    } else {
      geminiResp = data
      break
    }
  }

  const promptLength = calculatePromptTokens(req.messages);

  log?.debug(req)
  log?.debug(geminiResp)

  function genOpenAiResp(content: string | FunctionCall): OpenAI.Chat.ChatCompletion {
    if (typeof content === "string") {
      return {
        id: "chatcmpl-abc123",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: req.model,
        choices: [
          {
            message: { role: "assistant", content: content },
            finish_reason: "stop",
            index: 0,
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: promptLength,
          completion_tokens: content.length,
          total_tokens: content.length + promptLength
        }
      }
    }

    return {
      id: "chatcmpl-abc123",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: req.model,
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            function_call: {
              name: content.name ?? "",
              arguments: JSON.stringify(content.args),
            },
          },
          finish_reason: "function_call",
          index: 0,
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: promptLength,
        completion_tokens: 0,
        total_tokens: promptLength
      }
    }
  }

  return Response.json(genOpenAiResp(geminiResp))
}
