import "./globals.css";
import { ReactNode } from "react";
import { TelegramProvider } from "@/components/TelegramProvider";

export const metadata = {
  title: "SwipeMark",
  description: "Сохраняй ссылки свайпами",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-black text-white antialiased h-dvh w-full overflow-hidden">
        <TelegramProvider>{children}</TelegramProvider>
      </body>
    </html>
  );
}