import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** @deprecated prefer using zod */
export type DataDescription<T extends {}> = {
  [K in keyof T]: {
    type: "string" | "number" | "bigint" | "boolean" | "object" | "array";
    default?: string;
    description: string;
  };
};

/** @deprecated prefer using zod formatters */
export const formatKeys = <T extends {}>(desc: DataDescription<T>) => {
  return (Object.entries(desc) as [string, DataDescription<T>[keyof T]][])
    .map(
      ([key, value]) =>
        `- "${key}" - ${value.description}; or ${value.default ?? "null"} if not found`
    )
    .join("\n");
};

/** @deprecated prefer using zod formatters */
export const formatOutput = <T extends {}>(desc: DataDescription<T>) => {
  return `Respond using JSON format like this:
{
${(Object.entries(desc) as [string, DataDescription<T>[keyof T]][])
  .map(([key, value]) => `  "${key}": ${value.type} | null`)
  .join(",\n")}
}`;
};

/**
 * Helper to get a readable type name from a Zod type
 */
const getZodTypeName = (zodType: z.ZodTypeAny): string => {
  // Unwrap optional/nullable wrappers
  let currentType = zodType;
  let isNullable = false;

  while (
    currentType instanceof z.ZodOptional ||
    currentType instanceof z.ZodNullable
  ) {
    if (currentType instanceof z.ZodNullable) {
      isNullable = true;
    }
    currentType = (
      currentType as z.ZodOptional<any> | z.ZodNullable<any>
    ).unwrap();
  }

  // Get base type name
  let typeName = "any";
  if (currentType instanceof z.ZodString) typeName = "string";
  else if (currentType instanceof z.ZodNumber) typeName = "number";
  else if (currentType instanceof z.ZodBigInt) typeName = "bigint";
  else if (currentType instanceof z.ZodBoolean) typeName = "boolean";
  else if (currentType instanceof z.ZodArray) {
    const itemType = getZodTypeName((currentType as z.ZodArray<any>).element);
    typeName = `${itemType}[]`;
  } else if (currentType instanceof z.ZodObject) typeName = "object";
  else if (currentType instanceof z.ZodEnum) typeName = "enum";
  else if (currentType instanceof z.ZodUnion) typeName = "union";

  return isNullable ? `${typeName} | null` : typeName;
};

/**
 * Format Zod schema keys with descriptions for LLM prompts
 *
 * @example
 * const schema = z.object({
 *   name: z.string().describe("User's full name"),
 *   age: z.number().optional().describe("User's age in years")
 * });
 *
 * formatZodKeys(schema);
 * // Returns:
 * // - "name" - User's full name; required
 * // - "age" - User's age in years; optional (default: undefined)
 */
export const formatZodKeys = (schema: z.ZodObject<any>) => {
  const shape = schema.shape;

  return Object.entries(shape)
    .map(([key, value]) => {
      const zodType = value as z.ZodTypeAny;
      const description = zodType.description ?? "No description provided";

      // Check if field is optional
      const isOptional = zodType instanceof z.ZodOptional;
      const defaultText = isOptional
        ? "optional (default: undefined)"
        : "required";

      return `- "${key}" - ${description}; ${defaultText}`;
    })
    .join("\n");
};

/**
 * Format Zod schema as JSON example for LLM prompts
 *
 * @example
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number().optional(),
 *   tags: z.array(z.string())
 * });
 *
 * formatZodOutput(schema);
 * // Returns:
 * // Respond using JSON format like this:
 * // {
 * //   "name": string,
 * //   "age": number | null,
 * //   "tags": string[]
 * // }
 */
export const formatZodOutput = (schema: z.ZodObject<any>) => {
  const shape = schema.shape;

  const fields = Object.entries(shape)
    .map(([key, value]) => {
      const zodType = value as z.ZodTypeAny;
      const typeName = getZodTypeName(zodType);
      return `  "${key}": ${typeName}`;
    })
    .join(",\n");

  return `Respond using JSON format like this:
{
${fields}
}`;
};

/**
 * Format Zod schema as JSON Schema using zod-to-json-schema library
 * This is useful for Zod v3 which doesn't have native JSON Schema support
 *
 * Use with ElizaOS ObjectGenerationParams:
 * @example
 * const userSchema = z.object({
 *   name: z.string().describe("User's full name"),
 *   age: z.number().describe("User's age in years")
 * });
 *
 * const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
 *   prompt: "Generate a user profile",
 *   schema: zodToJsonSchema(userSchema)
 * });
 */
export const zodJsonSchema = (schema: z.ZodTypeAny) => {
  return zodToJsonSchema(schema, {
    target: "openApi3", // Compatible with OpenAPI 3.0
    $refStrategy: "none", // Inline all schemas for simplicity
  });
};
