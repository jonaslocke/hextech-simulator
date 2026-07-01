import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hextech Simulator",
  description: "Server-authoritative Riftbound simulator"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <div id="dialog-portal" />
      </body>
    </html>
  );
}
