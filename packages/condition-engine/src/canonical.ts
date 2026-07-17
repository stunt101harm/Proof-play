import { ConditionCompilerError } from "./errors";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** RFC 8785 JSON Canonicalization Scheme for JSON-compatible values. */
export function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ConditionCompilerError(
        "INVALID_SCHEMA",
        "Canonical JSON cannot contain a non-finite number.",
      );
    }

    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeJson(value[key] as JsonValue)}`,
      )
      .join(",")}}`;
  }

  throw new ConditionCompilerError(
    "INVALID_SCHEMA",
    "Canonical JSON received a non-JSON value.",
  );
}
