import type { ReactNode } from "react";

export const metadata = {
  title: "Vigour",
  description: "Voice-first visual Slack agent",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
