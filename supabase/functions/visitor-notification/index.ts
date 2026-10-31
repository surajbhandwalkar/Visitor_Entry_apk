import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

Deno.serve(async (req) => {
  const { visitor_id } = await req.json();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: visitor, error } = await admin.from("visitors").select("*").eq("id", visitor_id).single();
  if (error || !visitor) return new Response("Visitor not found", { status: 404 });
  const transporter = nodemailer.createTransport({ host: Deno.env.get("SMTP_HOST"), port: Number(Deno.env.get("SMTP_PORT") ?? 587), secure: false, auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASSWORD") } });
  const base = Deno.env.get("APPROVAL_BASE_URL")!;
  const manualRecipients = Array.isArray(visitor.approver_emails)
    ? visitor.approver_emails.filter((email: unknown): email is string => typeof email === "string" && email.trim().length > 0)
    : [];
  const defaultRecipients = (Deno.env.get("APPROVER_EMAILS") ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  const recipients = [...new Set([...defaultRecipients, ...manualRecipients])];
  if (recipients.length === 0) return new Response("No approver email configured", { status: 500 });
  const approveUrl = `${base}/visitor-decision?id=${visitor.id}&decision=approved`;
  const rejectUrl = `${base}/visitor-decision?id=${visitor.id}&decision=rejected`;
  await transporter.sendMail({
    from: Deno.env.get("SMTP_USER"),
    to: recipients,
    subject: `Visitor approval required: ${visitor.name}`,
    text: `Visitor ${visitor.name} from ${visitor.company} wants to meet ${visitor.host}.\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;padding:24px;color:#102a56"><h2>Visitor approval required</h2><p><b>${visitor.name}</b> from ${visitor.company} wants to meet <b>${visitor.host}</b>.</p><p>Purpose: ${visitor.purpose}</p><p><a href="${approveUrl}" style="display:inline-block;background:#168447;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;margin-right:8px">Approve visitor</a><a href="${rejectUrl}" style="display:inline-block;background:#c43d3d;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">Reject visitor</a></p><p style="color:#718096;font-size:12px">Visitor request ID: ${visitor.id}</p></div>`,
  });
  return Response.json({ ok: true });
});
