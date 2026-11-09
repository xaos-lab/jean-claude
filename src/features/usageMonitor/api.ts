import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface UsageBucket {
  utilization: number;
  resets_at: string | null;
}

export interface UsageData {
  five_hour: UsageBucket;
  seven_day: UsageBucket;
  seven_day_sonnet: UsageBucket | null;
  seven_day_opus: UsageBucket | null;
}

function httpsGet(
  url: string,
  headers: Record<string, string>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(
            new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`)
          );
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

const CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json");

function readCredentials(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function refreshViaClaudeCode(): Promise<void> {
  const { execFile } = require("child_process") as typeof import("child_process");
  return new Promise((resolve, reject) => {
    execFile("claude", ["--version"], { timeout: 15000 }, (err) => {
      if (err) {
        reject(new Error("Failed to refresh token via Claude Code"));
      } else {
        resolve();
      }
    });
  });
}

async function getOAuthToken(): Promise<string | null> {
  const creds = readCredentials();
  if (!creds) {
    return null;
  }

  const oauth = creds.claudeAiOauth as Record<string, unknown> | undefined;
  if (!oauth?.accessToken) {
    // Try flat structure
    return (creds.accessToken as string) || null;
  }

  // Check if token is expired or about to expire (5 min buffer)
  const expiresAt = oauth.expiresAt as number | undefined;
  if (expiresAt && expiresAt - Date.now() < 5 * 60 * 1000) {
    const rt = oauth.refreshToken as string | undefined;
    if (rt) {
      try {
        await refreshViaClaudeCode();
        // Re-read credentials after Claude Code refreshed them
        const updated = readCredentials();
        const updatedOauth = (updated?.claudeAiOauth as Record<string, unknown>) || null;
        if (updatedOauth?.accessToken) {
          return updatedOauth.accessToken as string;
        }
      } catch {
        // Refresh failed, return expired token and let caller handle the error
      }
    }
  }

  return oauth.accessToken as string;
}

export async function fetchUsageOAuth(token: string): Promise<UsageData> {
  const data = await httpsGet("https://api.anthropic.com/api/oauth/usage", {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
  });
  return JSON.parse(data);
}

async function getOrganizationId(sessionKey: string): Promise<string> {
  const data = await httpsGet("https://claude.ai/api/organizations", {
    Accept: "application/json",
    Cookie: `sessionKey=${sessionKey}`,
  });
  const orgs = JSON.parse(data);
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error("No organizations found");
  }
  return orgs[0].uuid;
}

export async function fetchUsageWeb(sessionKey: string): Promise<UsageData> {
  const orgId = await getOrganizationId(sessionKey);
  const data = await httpsGet(
    `https://claude.ai/api/organizations/${orgId}/usage`,
    {
      Accept: "application/json",
      Cookie: `sessionKey=${sessionKey}`,
    }
  );
  return JSON.parse(data);
}

export async function fetchUsage(
  authMethod: string,
  sessionKey: string
): Promise<UsageData> {
  if (authMethod === "auto") {
    // Try OAuth first
    const token = await getOAuthToken();
    if (token) {
      try {
        return await fetchUsageOAuth(token);
      } catch (oauthErr) {
        // Fall through to cookie method
        console.warn("OAuth usage fetch failed:", oauthErr);
        if (!sessionKey) {
          throw new Error(
            `OAuth token found but API call failed: ${oauthErr instanceof Error ? oauthErr.message : oauthErr}. Check your connection or try re-authenticating Claude Code.`
          );
        }
      }
    }
    // Fall back to session cookie if provided
    if (sessionKey) {
      return await fetchUsageWeb(sessionKey);
    }
    throw new Error(
      "No credentials found. Install Claude Code or set a session key in settings."
    );
  }

  // Explicit cookie method
  if (!sessionKey) {
    throw new Error(
      "Session key not configured. Set it via 'Jean Claude: Set Session Key' command."
    );
  }
  return await fetchUsageWeb(sessionKey);
}
