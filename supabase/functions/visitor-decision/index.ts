import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const decision = url.searchParams.get("decision");
  if (!id || !["approved", "rejected"].includes(decision ?? "")) return new Response("Invalid approval link", { status: 400 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("visitors").update({ status: decision, approved_by: "email-link", decision_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  if (error) return new Response("Could not save decision", { status: 500 });
  return new Response(`<h1>Visitor ${decision}</h1><p>You can close this window.</p>`, { headers: { "Content-Type": "text/html" } });
});
