"use client";

import { MailApp } from "@/components/mail/mail-app";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";

export default function Home() {
  return (
    <ReactQueryProvider>
      <MailApp />
    </ReactQueryProvider>
  );
}
