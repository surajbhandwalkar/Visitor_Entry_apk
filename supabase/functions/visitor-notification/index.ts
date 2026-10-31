import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const jsonError = (message: string, status: number) =>
  Response.json({ ok: false, error: message }, { status });

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const visitorId = typeof body?.visitor_id === "string" ? body.visitor_id : "";
    if (!visitorId) return jsonError("Missing visitor_id", 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const approvalBaseUrl = Deno.env.get("APPROVAL_BASE_URL");
    const missing = [
      ["SUPABASE_URL", supabaseUrl],
      ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
      ["SMTP_USER", smtpUser],
      ["SMTP_PASSWORD", smtpPassword],
      ["APPROVAL_BASE_URL", approvalBaseUrl],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) return jsonError(`Missing function secrets: ${missing.join(", ")}`, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: visitor, error } = await admin.from("visitors").select("*").eq("id", visitorId).single();
    if (error || !visitor) return jsonError("Visitor not found", 404);

    const manualRecipients = Array.isArray(visitor.approver_emails)
      ? visitor.approver_emails.filter((email: unknown): email is string => typeof email === "string" && email.trim().length > 0)
      : [];
    const defaultRecipients = (Deno.env.get("APPROVER_EMAILS") ?? "").split(",").map((email) => email.trim()).filter(Boolean);
    const recipients = [...new Set([...defaultRecipients, ...manualRecipients])];
    if (recipients.length === 0) return jsonError("No approver email configured", 500);

    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com",
      port: Number(Deno.env.get("SMTP_PORT") ?? 587),
      secure: false,
      auth: { user: smtpUser, pass: smtpPassword },
    });
    const approveUrl = `${approvalBaseUrl}/visitor-decision?id=${visitor.id}&decision=approved`;
    const rejectUrl = `${approvalBaseUrl}/visitor-decision?id=${visitor.id}&decision=rejected`;
    await transporter.sendMail({
      from: smtpUser,
      to: recipients,
      subject: `Visitor approval required: ${visitor.name}`,
      text: `Visitor ${visitor.name} from ${visitor.company} wants to meet ${visitor.host}.\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;padding:24px;color:#102a56"><h2>Visitor approval required</h2><p><b>${visitor.name}</b> from ${visitor.company} wants to meet <b>${visitor.host}</b>.</p><p>Purpose: ${visitor.purpose}</p><p><a href="${approveUrl}" style="display:inline-block;background:#168447;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;margin-right:8px">Approve visitor</a><a href="${rejectUrl}" style="display:inline-block;background:#c43d3d;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">Reject visitor</a></p><p style="color:#718096;font-size:12px">Visitor request ID: ${visitor.id}</p></div>`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected notification error";
    console.error("visitor-notification failed", message);
    return jsonError(`Email delivery failed: ${message}`, 502);
  }
});
