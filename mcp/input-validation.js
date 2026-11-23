"use strict";
// Tool-argument validation shared by the npm server (index.js) and the hosted Worker
// (src/index.ts imports this file), so both accept and reject exactly the same calls.
// Each caller passes its own `z`; both pin the same zod version (schema-drift-check.js).

// Convert a non-empty all-numeric string to a number; pass everything else through
// untouched so z.number() rejects "", null and "abc" and reports a missing field.
function coerceNumericString(v) {
  if (typeof v === "string") {
    const t = v.trim();
    if (t !== "" && Number.isFinite(Number(t))) return Number(t);
  }
  return v;
}

// JSON Schema `properties` -> zod raw shape. Enums, patterns and lengths are left to
// BD, whose own messages are clearer than zod's. EMPTY_STRING_CREATE_OMISSION (create* tools):
// an optional null, or "" on a numeric/boolean field, is dropped before validation.
function jsonSchemaToZodShape(z, properties, requiredSet, emptyIsOmission) {
  const shape = {};
  for (const [propName, propSchema] of Object.entries(properties)) {
    let zodType;
    if (Array.isArray(propSchema.anyOf)) {
      const branches = propSchema.anyOf;
      const scalarTypes = [z.string()];
      if (branches.some((b) => b && b.type === "number")) scalarTypes.push(z.number());
      if (branches.some((b) => b && b.type === "boolean")) scalarTypes.push(z.boolean());
      const scalar = scalarTypes.length > 1 ? z.union(scalarTypes) : scalarTypes[0];
      zodType = z.union([scalar, z.array(scalar)]);
      if (propSchema.description) zodType = zodType.describe(propSchema.description);
      if (!requiredSet.has(propName)) zodType = zodType.optional();
      shape[propName] = zodType;
      continue;
    }
    const type = propSchema.type || "string";
    switch (type) {
      case "integer":
      case "number":
        zodType = z.preprocess(coerceNumericString, z.number());
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.any());
        break;
      case "object":
        zodType = z.preprocess((v) => {
          if (typeof v !== "string") return v;
          try { return JSON.parse(v); } catch (e) { return v; }
        }, z.record(z.string(), z.any()));
        break;
      default:
        zodType = z.preprocess((v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : v), z.string());
    }
    if (propSchema.description) zodType = zodType.describe(propSchema.description);
    if (!requiredSet.has(propName)) {
      zodType = zodType.optional();
      if (emptyIsOmission) {
        const emptyDrops = type === "integer" || type === "number" || type === "boolean";
        zodType = z.preprocess((v) => (v === null || (emptyDrops && v === "") ? undefined : v), zodType);
      }
    }
    shape[propName] = zodType;
  }
  return shape;
}

// Inverse EAV tools take custom field names the spec cannot list, and updateDesignSettings
// refuses unknown keys itself; every other tool drops keys its schema does not define.
function acceptsUnknownParams(toolName, routingMode) {
  return routingMode === "inverse" || toolName === "updateDesignSettings";
}

module.exports = { coerceNumericString, jsonSchemaToZodShape, acceptsUnknownParams };
