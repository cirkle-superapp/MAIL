import { serve } from "inngest/next";
import { inngest, inngestFunctions } from "@/lib/inngest";

export const dynamic = "force-dynamic";
export const GET = serve({ client: inngest, functions: inngestFunctions });
export const POST = serve({ client: inngest, functions: inngestFunctions });
export const PUT = serve({ client: inngest, functions: inngestFunctions });
