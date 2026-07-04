import "./globals.css";

export const metadata = {
  title: "AI Sales Lead Intelligence Platform",
  description:
    "ML-powered lead scoring, AI explanations, and RAG-grounded recommendations for modern sales teams.",
  keywords: ["lead scoring", "AI sales", "CRM intelligence", "machine learning"],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-surface-900 antialiased">
        {children}
      </body>
    </html>
  );
}
