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

function getOAuthToken(): string | null {
  // Try Claude Code credentials file
  const credentialsPath = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    if (fs.existsSync(credentialsPath)) {
      const content = fs.readFileSync(credentialsPath, "utf-8");
      const creds = JSON.parse(content);
      // The file may have different structures
      if (creds.claudeAiOauth?.accessToken) {
        return creds.claudeAiOauth.accessToken;
      }
      if (creds.accessToken) {
        return creds.accessToken;
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
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
    const token = getOAuthToken();
    if (token) {
      try {
        return await fetchUsageOAuth(token);
      } catch {
        // Fall through to cookie method
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
