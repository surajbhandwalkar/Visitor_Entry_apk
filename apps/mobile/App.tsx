import { Component, ErrorInfo, ReactNode, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const hasValidKeyFormat = Boolean(supabaseKey && (/^eyJ[\w-]+\./.test(supabaseKey) || /^sb_publishable_/.test(supabaseKey)));
const configurationError = !supabaseUrl || !supabaseKey
  ? "Supabase configuration is missing. Create a new build after setting the EAS environment variables."
  : !/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl)
    ? "Supabase URL is invalid. It must look like https://your-project.supabase.co."
    : !hasValidKeyFormat
      ? "Supabase key is invalid. Use the Publishable key or anon public key from Supabase Project Settings."
    : null;
let supabase: ReturnType<typeof createClient> | null = null;
let clientError: string | null = null;
if (!configurationError) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    clientError = error instanceof Error ? error.message : "Supabase client could not start.";
  }
}

function VisitorGateApp() {
  type Visitor = { id: string; name: string; company: string; purpose: string; status: string; created_at: string };
  const purposes = ["Meeting", "Interview", "Delivery", "Maintenance", "Sales visit", "Other"];
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", company: "", host: "", purpose: "", approverEmails: "" });
  const [saving, setSaving] = useState(false);
  const [recentVisitors, setRecentVisitors] = useState<Visitor[]>([]);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [approverOptions, setApproverOptions] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

  async function loadVisitors() {
    if (!supabase || !session) return;
    const { data, error } = await supabase
      .from("visitors")
      .select("id,name,company,purpose,status,created_at")
      .eq("created_by", session.user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setRecentVisitors(data ?? []);
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadVisitors();
    supabase?.from("company_approvers").select("id,name,email").eq("active", true).order("name").then(({ data }) => setApproverOptions(data ?? []));
    const timer = setInterval(loadVisitors, 5000);
    return () => clearInterval(timer);
  }, [session]);

  async function signIn() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert("Login failed", error.message);
  }

  async function registerVisitor() {
    if (!supabase) return;
    const requiredFields = [form.name, form.phone, form.company, form.host, form.purpose];
    if (requiredFields.some((value) => !value.trim())) {
      Alert.alert("Missing information", "Please fill every visitor field.");
      return;
    }
    const approverEmails = selectedApprovers;
    setSaving(true);
    const visitorData = {
      name: form.name,
      phone: form.phone,
      company: form.company,
      host: form.host,
      purpose: form.purpose,
      approver_emails: approverEmails,
      created_by: session.user.id,
      status: "pending",
    };
    const { data: visitor, error } = await supabase.from("visitors").insert(visitorData).select("id").single();
    if (!error && visitor) {
      const notification = await supabase.functions.invoke("visitor-notification", { body: { visitor_id: visitor.id } });
      if (notification.error) {
        setSaving(false);
        let notificationMessage = notification.error.message;
        const context = (notification.error as { context?: Response }).context;
        if (context) {
          try {
            const details = await context.clone().json();
            if (typeof details?.error === "string") notificationMessage = details.error;
          } catch {
            // Keep the SDK error when the function response is not JSON.
          }
        }
        Alert.alert(
          "Saved, notification failed",
          `The visitor record was saved, but the approval email could not be sent.\n\n${notificationMessage}`,
        );
        return;
      }
    }
    setSaving(false);
    if (error) Alert.alert("Could not save", error.message);
    else {
      setForm({ name: "", phone: "", company: "", host: "", purpose: "", approverEmails: "" });
      setSelectedApprovers([]);
      await loadVisitors();
      Alert.alert("Saved", "Approval email has been queued for the help desk.");
    }
  }

  if (configurationError || clientError) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Visitor Gate</Text>
        <Text style={styles.errorTitle}>App configuration error</Text>
        <Text style={styles.subtitle}>{configurationError ?? clientError}</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Visitor Gate</Text>
        <Text style={styles.subtitle}>Watchman login</Text>
        <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry autoComplete="password" textContentType="password" value={password} onChangeText={setPassword} />
        <Button title="Login" onPress={signIn} />
      </SafeAreaView>
    );
  }

  const fields: Array<[keyof typeof form, string]> = [
    ["name", "Visitor name"], ["phone", "Phone number"], ["company", "Company"],
    ["host", "Person to meet"],
  ];
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.title}>Visitor Gate</Text>
        <Text style={styles.subtitle}>Register visitor and track approval</Text>
        {fields.map(([key, placeholder]) => (
          <TextInput key={key} style={styles.input} placeholder={placeholder} value={form[key]} onChangeText={(value) => setForm({ ...form, [key]: value })} />
        ))}
        <Text style={styles.label}>Visiting purpose</Text>
        <Pressable style={styles.select} onPress={() => setPurposeOpen(!purposeOpen)}>
          <Text style={form.purpose ? styles.selectText : styles.placeholder}>{form.purpose || "Select purpose"}</Text>
          <Text style={styles.chevron}>{purposeOpen ? "▲" : "▼"}</Text>
        </Pressable>
        {purposeOpen && (
          <View style={styles.options}>
            {purposes.map((purpose) => (
              <Pressable key={purpose} style={styles.option} onPress={() => { setForm({ ...form, purpose }); setPurposeOpen(false); }}>
                <Text style={styles.optionText}>{purpose}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.label}>Additional approvers (optional)</Text>
        <Text style={styles.helper}>Help desk and admin always receive the email. Select extra company approvers below.</Text>
        <View style={styles.approverList}>
          {approverOptions.length === 0 && <Text style={styles.empty}>No additional approvers configured.</Text>}
          {approverOptions.map((approver) => {
            const selected = selectedApprovers.includes(approver.email);
            return <Pressable key={approver.id} style={[styles.approverOption, selected && styles.approverSelected]} onPress={() => setSelectedApprovers(selected ? selectedApprovers.filter((email) => email !== approver.email) : [...selectedApprovers, approver.email])}>
              <Text style={[styles.optionText, selected && styles.selectedText]}>{selected ? "✓ " : ""}{approver.name} ({approver.email})</Text>
            </Pressable>;
          })}
        </View>
        <Button title={saving ? "Saving..." : "Submit for approval"} disabled={saving} onPress={registerVisitor} />
        <Text style={styles.sectionTitle}>Recent requests</Text>
        {recentVisitors.length === 0 && <Text style={styles.empty}>No visitor requests yet.</Text>}
        {recentVisitors.map((visitor) => (
          <View key={visitor.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{visitor.name}</Text>
              <Text style={[styles.status, styles[`status_${visitor.status}` as keyof typeof styles]]}>{visitor.status}</Text>
            </View>
            <Text style={styles.cardDetail}>{visitor.company} · {visitor.purpose}</Text>
            <Text style={styles.cardTime}>{new Date(visitor.created_at).toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.logout}><Button title="Logout" onPress={() => supabase?.auth.signOut()} /></View>
      </ScrollView>
    </SafeAreaView>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Visitor Gate startup error", error);
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>Visitor Gate</Text>
          <Text style={styles.errorTitle}>App could not start</Text>
          <Text style={styles.subtitle}>{this.state.error.message}</Text>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <AppErrorBoundary><VisitorGateApp /></AppErrorBoundary>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#eef4ff" },
  title: { fontSize: 30, fontWeight: "800", marginBottom: 4, color: "#102a56" },
  subtitle: { fontSize: 15, marginBottom: 20, color: "#526581" },
  label: { fontSize: 13, fontWeight: "700", color: "#526581", marginBottom: 6 },
  helper: { fontSize: 12, color: "#718096", marginBottom: 8 },
  input: { backgroundColor: "white", borderWidth: 1, borderColor: "#d7e1ef", borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16 },
  select: { backgroundColor: "white", borderWidth: 1, borderColor: "#d7e1ef", borderRadius: 12, padding: 14, marginBottom: 6, flexDirection: "row", justifyContent: "space-between" },
  selectText: { color: "#102a56", fontSize: 16 },
  placeholder: { color: "#8a99ad", fontSize: 16 },
  chevron: { color: "#3674d9" },
  options: { backgroundColor: "white", borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: "#d7e1ef", overflow: "hidden" },
  option: { padding: 14, borderBottomWidth: 1, borderBottomColor: "#edf1f7" },
  optionText: { color: "#102a56", fontSize: 15 },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: "#102a56", marginTop: 28, marginBottom: 10 },
  empty: { color: "#718096", marginBottom: 12 },
  card: { backgroundColor: "white", borderRadius: 14, padding: 15, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#3674d9" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardName: { fontSize: 17, fontWeight: "700", color: "#102a56" },
  cardDetail: { color: "#526581", marginTop: 5 },
  cardTime: { color: "#8a99ad", fontSize: 12, marginTop: 7 },
  status: { fontWeight: "800", textTransform: "capitalize" },
  status_pending: { color: "#c47a08" },
  status_approved: { color: "#168447" },
  status_rejected: { color: "#c43d3d" },
  status_entered: { color: "#3674d9" },
  status_exited: { color: "#718096" },
  logout: { marginTop: 24 },
  errorTitle: { fontSize: 20, fontWeight: "700", color: "#b91c1c", marginTop: 24, marginBottom: 8 },
});
