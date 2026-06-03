import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopX Product Extractor",
  description: "Server-side ecommerce product extraction API for ShopX.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
