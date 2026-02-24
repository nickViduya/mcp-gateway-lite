import { z } from "zod";

import { executeRemoteTool } from "../proxy/invoke.js";
import { findServerWithTool } from "../registry/store.js";

const executeToolInputSchema = z.object({
  server: z.string().min(1),
  tool: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
});

export const executeToolSchema = executeToolInputSchema;

type ExecuteToolContext = {
  userId: string;
};

export const runExecuteTool = async (
  input: unknown,
  context: ExecuteToolContext,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
}> => {
  const parsedInput = executeToolInputSchema.parse(input);
  const serverWithTool = await findServerWithTool(parsedInput.server, parsedInput.tool);

  if (serverWithTool === undefined) {
    const missingTargetResponse = {
      success: false as const,
      error: "execution_failed" as const,
      message: `Unknown server/tool combination: ${parsedInput.server}.${parsedInput.tool}`,
    };
    return {
      content: [
        {
          type: "text",
          text: missingTargetResponse.message,
        },
      ],
      structuredContent: missingTargetResponse,
    };
  }

  const execution = await executeRemoteTool({
    userId: context.userId,
    server: serverWithTool.server,
    toolName: parsedInput.tool,
    params: parsedInput.params,
  });

  if (!execution.success) {
    return {
      content: [
        {
          type: "text",
          text: execution.message,
        },
      ],
      structuredContent: execution,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Executed ${parsedInput.server}.${parsedInput.tool} successfully`,
      },
    ],
    structuredContent: execution,
  };
};
