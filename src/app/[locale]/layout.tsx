import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

const manrope = Manrope({
    subsets: ["latin"],
    variable: "--font-manrope",
    weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-space-grotesk",
    weight: ["500", "700"],
});

export const metadata: Metadata = {
    title: "CINQRA — AI Creative Studio",
    description: "Cinema, Reimagined. An independent creative studio for AI images, videos and cinematic workflows.",
    applicationName: "CINQRA",
    icons: { icon: "/cinqra/app-icon.png", apple: "/cinqra/app-icon.png" },
    manifest: "/manifest.webmanifest",
};

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const messages = await getMessages();

    return (
        <html lang={locale} className="dark">
            <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
                <NextIntlClientProvider messages={messages}>
                    <TooltipProvider>{children}</TooltipProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
