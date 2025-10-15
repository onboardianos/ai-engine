import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSource = "frontend" | "edge_function" | "api";

interface LogEntry {
  userId?: string;
  fileId?: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  errorDetails?: any;
  stackTrace?: string;
  requestData?: any;
  responseData?: any;
  metadata?: any;
}

export async function logDebug(entry: LogEntry) {
  try {
    const { error } = await supabase.from("debug_logs").insert({
      user_id: entry.userId || null,
      file_id: entry.fileId || null,
      log_level: entry.level,
      source: entry.source,
      message: entry.message,
      error_details: entry.errorDetails || null,
      stack_trace: entry.stackTrace || null,
      request_data: entry.requestData || null,
      response_data: entry.responseData || null,
      metadata: entry.metadata || {},
    });

    if (error) {
      console.error("Failed to log debug entry:", error);
    }
  } catch (err) {
    console.error("Logger error:", err);
  }
}

export function extractErrorDetails(error: any): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { raw: String(error) };
}
