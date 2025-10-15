// Base64 encoding helper for Vision OCR in Supabase Edge Functions
export function toBase64DataUri(bytes: Uint8Array, mime = "application/octet-stream"): string {
  // Deno has btoa but expects a string; convert bytes → binary string
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(bin);
  return `data:${mime};base64,${b64}`;
}
