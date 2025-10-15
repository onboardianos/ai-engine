import Ajv, { ErrorObject } from "npm:ajv@8";
import addFormats from "npm:ajv-formats@3";

let ajvInstance: Ajv | null = null;

export interface ValidationResult {
  ok: boolean;
  errors: ErrorObject[];
  errorMessages: string[];
}

async function getValidator(): Promise<Ajv> {
  if (ajvInstance) {
    return ajvInstance;
  }

  ajvInstance = new Ajv({
    allErrors: true,
    strict: true,
    validateFormats: true,
  });

  addFormats(ajvInstance);

  try {
    const schemaPath = new URL("../../../schema/module-bundle.schema.json", import.meta.url);
    const schemaText = await Deno.readTextFile(schemaPath);
    const schema = JSON.parse(schemaText);
    ajvInstance.addSchema(schema, "module-bundle");
  } catch (error) {
    console.error("Failed to load schema:", error);
    throw new Error(`Schema loading failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return ajvInstance;
}

export async function validateBundle(bundle: unknown): Promise<ValidationResult> {
  const validator = await getValidator();
  const validate = validator.getSchema("module-bundle");

  if (!validate) {
    return {
      ok: false,
      errors: [],
      errorMessages: ["Schema not found: module-bundle"],
    };
  }

  const valid = validate(bundle);

  if (valid) {
    return {
      ok: true,
      errors: [],
      errorMessages: [],
    };
  }

  const errors = validate.errors || [];
  const errorMessages = errors.map((err) => {
    const path = err.instancePath || "/";
    const message = err.message || "validation error";
    return `${path}: ${message}`;
  });

  return {
    ok: false,
    errors,
    errorMessages,
  };
}

export async function validatePartialBundle(
  bundle: unknown,
  section: "manifest" | "content" | "interactions" | "assessments" | "accessibility" | "analytics" | "media" | "meta"
): Promise<ValidationResult> {
  const validator = await getValidator();
  const fullSchema = validator.getSchema("module-bundle");

  if (!fullSchema || !fullSchema.schema || typeof fullSchema.schema !== "object") {
    return {
      ok: false,
      errors: [],
      errorMessages: ["Schema not found or invalid"],
    };
  }

  const sectionSchema = (fullSchema.schema as any).$defs?.[section.charAt(0).toUpperCase() + section.slice(1)];

  if (!sectionSchema) {
    return {
      ok: false,
      errors: [],
      errorMessages: [`Section schema not found: ${section}`],
    };
  }

  const sectionValidator = validator.compile(sectionSchema);
  const valid = sectionValidator(bundle);

  if (valid) {
    return {
      ok: true,
      errors: [],
      errorMessages: [],
    };
  }

  const errors = sectionValidator.errors || [];
  const errorMessages = errors.map((err) => {
    const path = err.instancePath || "/";
    const message = err.message || "validation error";
    return `${section}${path}: ${message}`;
  });

  return {
    ok: false,
    errors,
    errorMessages,
  };
}

export function formatValidationErrors(errors: ErrorObject[]): string {
  if (errors.length === 0) {
    return "No errors";
  }

  return errors
    .map((err, idx) => {
      const path = err.instancePath || "/";
      const keyword = err.keyword;
      const message = err.message || "validation error";
      const params = JSON.stringify(err.params);

      return `${idx + 1}. ${path} (${keyword}): ${message}\n   Params: ${params}`;
    })
    .join("\n");
}

export function getSchemaVersion(): string {
  return "1.0.0";
}
