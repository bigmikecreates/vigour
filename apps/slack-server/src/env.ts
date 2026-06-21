import { z } from "zod";

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_APP_TOKEN: z.string().min(1), // xapp- token for Socket Mode
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_CLIENT_ID: z.string().min(1),
  SLACK_CLIENT_SECRET: z.string().min(1),
  SLACK_OAUTH_REDIRECT_URI: z.string().url().default("http://localhost:3001/slack/oauth/callback"),
  PORT: z.coerce.number().default(3001),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Missing or invalid environment variables. See .env.example.");
  }
  return parsed.data;
}
