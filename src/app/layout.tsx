import "./globals.css";
import { ReactNode } from "react";
import Script from "next/script";
import { TelegramProvider } from "@/components/TelegramProvider";

export const metadata = {
  title: "SwipeMark",
  description: "Сохраняй ссылки свайпами",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js?63"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-black text-white antialiased">
        <TelegramProvider>{children}</TelegramProvider>
      </body>
    </html>
  );
}