import "./globals.css";
import { ReactNode } from "react";
import { TelegramProvider } from "@/components/TelegramProvider";
import { I18nProvider } from "@/components/I18nProvider";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata = {
  title: "SwipeMark",
  description: "Сохраняй ссылки свайпами",
  manifest: "/manifest.webmanifest",
  applicationName: "SwipeMark",
  appleWebApp: {
    capable: true,
    title: "SwipeMark",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  viewport:
    "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-bg text-text antialiased h-dvh w-full overflow-hidden">
        <TelegramProvider>
          <I18nProvider>{children}</I18nProvider>
        </TelegramProvider>
        <RegisterSW />
      </body>
    </html>
  );
}