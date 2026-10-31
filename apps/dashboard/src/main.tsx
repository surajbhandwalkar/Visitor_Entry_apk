import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./style.css";

type Visitor = { id: string; name: string; phone: string; company: string; host: string; purpose: string; status: string; created_at: string; };
type Approver = { id: string; name: string; email: string; active: boolean; };
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [approverName, setApproverName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  if (!supabase) return <main className="login"><h1>Visitor Gate</h1><p>Dashboard configuration is missing.</p><p>Create <code>apps/dashboard/.env</code> with:</p><pre>VITE_SUPABASE_URL=https://your-project.supabase.co{"\n"}VITE_SUPABASE_ANON_KEY=your-anon-key</pre><p>Then restart the dashboard.</p></main>;
  async function load() {
    const from = `${month}-01T00:00:00.000Z`;
    const to = new Date(`${month}-01T00:00:00.000Z`);
    to.setUTCMonth(to.getUTCMonth() + 1);
    const { data, error } = await supabase.from("visitors").select("*").gte("created_at", from).lt("created_at", to.toISOString()).order("created_at", { ascending: false });
    if (error) {
      alert(`Could not load visitors: ${error.message}`);
      return;
    }
    setVisitors(data ?? []);
  }
  useEffect(() => { if (session) load(); }, [month, session]);
  async function loadApprovers() {
    const { data, error } = await supabase.from("company_approvers").select("*").order("name");
    if (error) {
      alert(`Could not load company approvers: ${error.message}`);
      return;
    }
    setApprovers(data ?? []);
  }
  useEffect(() => { if (session) loadApprovers(); }, [session]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  async function decision(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.rpc("decide_visitor", { visitor_id: id, new_status: status });
    if (error) alert(error.message); else load();
  }
  async function addApprover() {
    const { error } = await supabase.from("company_approvers").insert({ name: approverName.trim(), email: approverEmail.trim().toLowerCase() });
    if (error) alert(error.message); else { setApproverName(""); setApproverEmail(""); loadApprovers(); }
  }
  async function toggleApprover(approver: Approver) {
    const { error } = await supabase.from("company_approvers").update({ active: !approver.active }).eq("id", approver.id);
    if (error) alert(error.message); else loadApprovers();
  }
  async function deleteApprover(approver: Approver) {
    if (!window.confirm(`Delete ${approver.name} (${approver.email})?`)) return;
    const { error } = await supabase.from("company_approvers").delete().eq("id", approver.id);
    if (error) alert(`Could not delete company approver: ${error.message}`); else loadApprovers();
  }
  if (!session) return <main className="login"><h1>Visitor Gate</h1><p>Admin dashboard login</p><input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><button onClick={async () => { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) alert(error.message); }}>Login</button></main>;
  return <main><header><div><h1>Visitor Gate</h1><p>Approval and entry records</p></div><div><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><button onClick={() => supabase.auth.signOut()}>Logout</button></div></header>
    <section className="stats"><b>{visitors.length}<small> visitors this month</small></b><b>{visitors.filter((v) => v.status === "pending").length}<small> pending</small></b></section>
    <div className="table"><div className="row head"><span>Visitor</span><span>Host / purpose</span><span>Time</span><span>Status</span><span>Action</span></div>
      {visitors.map((v) => <div className="row" key={v.id}><span><strong>{v.name}</strong><br />{v.company} · {v.phone}</span><span>{v.host}<br />{v.purpose}</span><span>{new Date(v.created_at).toLocaleString()}</span><span className={`status ${v.status}`}>{v.status}</span><span>{v.status === "pending" && <><button onClick={() => decision(v.id, "approved")}>Approve</button><button className="reject" onClick={() => decision(v.id, "rejected")}>Reject</button></>}</span></div>)}
    </div>
    <section className="approver-panel"><h2>Company approvers</h2><p>These people appear in the watchman app. Help desk and admin defaults always receive every request.</p><div className="approver-form"><input placeholder="Name" value={approverName} onChange={(e) => setApproverName(e.target.value)} /><input placeholder="Email" value={approverEmail} onChange={(e) => setApproverEmail(e.target.value)} /><button onClick={addApprover} disabled={!approverName.trim() || !approverEmail.trim()}>Add email</button></div>{approvers.map((approver) => <div className="approver-row" key={approver.id}><span>{approver.name} · {approver.email}</span><div><button onClick={() => toggleApprover(approver)} className={approver.active ? "" : "reject"}>{approver.active ? "Enabled" : "Disabled"}</button><button onClick={() => deleteApprover(approver)} className="delete">Delete</button></div></div>)}</section></main>;
}
createRoot(document.getElementById("root")!).render(<Dashboard />);
