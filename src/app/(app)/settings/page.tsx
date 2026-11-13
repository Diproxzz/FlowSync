"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Building2, Sliders, Cpu, CheckCircle2, XCircle, ArrowUp, ArrowDown, RefreshCw, ArrowLeft, Download, Database, ShieldCheck, Clock, FileJson, Upload, MessageSquare, Smartphone, QrCode } from "lucide-react";

interface ProviderInfo {
  id: string;
  name: string;
  isConfigured: boolean;
  model: string;
  baseUrl?: string;
}

interface SettingsState {
  company: {
    name: string;
    gstin: string;
    address: string;
  };
  fiscalYearStartMonth: number;
  lapsedDays: number;
  fuzzyThreshold: number;
  providerOrder: string[];
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>({
    company: { name: "", gstin: "", address: "" },
    fiscalYearStartMonth: 4,
    lapsedDays: 60,
    fuzzyThreshold: 0.85,
    providerOrder: ["groq", "gemini", "glm-ocr", "paddleocr-vl", "qwen2-vl", "openrouter", "ollama"],
  });
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ [id: string]: { ok: boolean; message: string } }>({});
  const [backupInfo, setBackupInfo] = useState<{ latest?: any; backups?: Array<{ name: string; createdAt: string }> } | null>(null);
  const [backupTriggering, setBackupTriggering] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const fetchBackupInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup");
      if (res.ok) {
        const data = await res.json();
        setBackupInfo(data);
      }
    } catch (e) {
      console.error("Failed to load backup info", e);
    }
  }, []);

  const handleTriggerBackup = async () => {
    setBackupTriggering(true);
    setBackupMessage(null);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBackupMessage("Backup successfully completed!");
        await fetchBackupInfo();
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message || JSON.stringify(data.error)
            : data.error;
        setBackupMessage(`Backup failed: ${errorMsg || "Unknown error"}`);
      }
    } catch (e: any) {
      setBackupMessage(`Backup failed: ${e.message || "Network error"}`);
    } finally {
      setBackupTriggering(false);
      setTimeout(() => setBackupMessage(null), 5000);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupTriggering(true);
    setBackupMessage("Reading and restoring backup data into database...");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", data: json }),
      });
      const result = await res.json();
      if (res.ok) {
        setBackupMessage("Production changes & backup restored successfully into database!");
        await fetchBackupInfo();
      } else {
        const errorMsg =
          typeof result.error === "object"
            ? result.error?.message || JSON.stringify(result.error)
            : result.error;
        setBackupMessage(`Restore failed: ${errorMsg || "Unknown error"}`);
      }
    } catch (err: any) {
      setBackupMessage(`Restore error: ${err.message}`);
    } finally {
      setBackupTriggering(false);
      e.target.value = "";
      setTimeout(() => setBackupMessage(null), 6000);
    }
  };

  // WhatsApp Gateway state
  const [waStatus, setWaStatus] = useState<{
    status: "CONNECTED" | "CONNECTING" | "QR_READY" | "DISCONNECTED";
    phoneNumber: string | null;
    qrCode: string | null;
    lastError: string | null;
  }>({
    status: "DISCONNECTED",
    phoneNumber: null,
    qrCode: null,
    lastError: null,
  });
  const [waLoading, setWaLoading] = useState(false);
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingCodeLoading, setPairingCodeLoading] = useState(false);
  const [linkTab, setLinkTab] = useState<"qr" | "code">("qr");

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone.trim()) return;
    setPairingCodeLoading(true);
    try {
      const res = await fetch("/api/whatsapp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pairing_code", phone: pairingPhone.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.pairingCode) {
        setPairingCode(data.pairingCode);
      } else {
        alert(data.error?.message || "Failed to generate pairing code.");
      }
    } catch (err: any) {
      alert(err?.message || "Network error generating pairing code.");
    } finally {
      setPairingCodeLoading(false);
    }
  };

  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch WhatsApp status:", err);
    }
  }, []);

  const handleConnectWhatsApp = async () => {
    setWaLoading(true);
    try {
      const res = await fetch("/api/whatsapp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const data = await res.json();
      setWaStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setWaLoading(false);
    }
  };

  const handleRefreshWhatsAppQR = async () => {
    setWaLoading(true);
    try {
      const res = await fetch("/api/whatsapp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const data = await res.json();
      setWaStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setWaLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!confirm("Are you sure you want to unlink WhatsApp from FlowPilot?")) return;
    setWaLoading(true);
    try {
      const res = await fetch("/api/whatsapp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      setWaStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setWaLoading(false);
    }
  };

  useEffect(() => {
    fetchWhatsAppStatus();
  }, [fetchWhatsAppStatus]);

  // Auto-poll WhatsApp status when QR is ready, pairing code is waiting, or connecting
  useEffect(() => {
    if (waStatus.status === "QR_READY" || pairingCode !== null || waStatus.status === "CONNECTING") {
      const timer = setInterval(() => {
        fetchWhatsAppStatus();
      }, 2000);
      return () => clearInterval(timer);
    }
  }, [waStatus.status, pairingCode, fetchWhatsAppStatus]);

  useEffect(() => {
    if (waStatus.status === "CONNECTED") {
      setPairingCode(null);
    }
  }, [waStatus.status]);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [res, sessionRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/auth/me"),
      ]);

      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (data.providers) setProviders(data.providers);

      if (sessionRes.ok) {
        const sData = await sessionRes.json();
        setIsAdmin(!!sData.data?.isAdmin);
      }
      fetchBackupInfo();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fetchBackupInfo]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    setTestResult((prev) => ({ ...prev, [providerId]: { ok: false, message: "Testing..." } }));

    try {
      const res = await fetch("/api/settings/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });

      const data = await res.json();
      setTestResult((prev) => ({
        ...prev,
        [providerId]: {
          ok: res.ok,
          message: data.message || (res.ok ? "Connection successful" : "Connection failed"),
        },
      }));
    } catch {
      setTestResult((prev) => ({
        ...prev,
        [providerId]: { ok: false, message: "Network error reaching server" },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const moveProvider = (index: number, direction: "up" | "down") => {
    const newOrder = [...settings.providerOrder];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    setSettings({ ...settings, providerOrder: newOrder });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">System Settings</h2>
          <p className="text-xs text-ink-3">Issuer company details, inventory defaults, and system preferences</p>
        </div>
        {isAdmin && (
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition w-fit cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Admin Page</span>
          </Link>
        )}
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Company Settings */}
        <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-ink">Company Profile (Invoice Issuer)</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Company Name</label>
              <input
                type="text"
                value={settings.company.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    company: { ...settings.company, name: e.target.value },
                  })
                }
                className="w-full px-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Issuer GSTIN (Company GSTIN)</label>
              <input
                type="text"
                value={settings.company.gstin}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    company: { ...settings.company, gstin: e.target.value.toUpperCase() },
                  })
                }
                className="w-full px-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink font-mono uppercase"
                required
              />
              <span className="text-[10px] text-ink-3 mt-1 block">
                Invoices where customer GSTIN equals this GSTIN are rejected as invalid.
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Registered Address</label>
            <input
              type="text"
              value={settings.company.address}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  company: { ...settings.company, address: e.target.value },
                })
              }
              className="w-full px-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
            />
          </div>
        </div>

        {/* Operational Parameters */}
        <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Sliders className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-ink">Operational & Analytics Defaults</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">FY Start Month</label>
              <select
                value={settings.fiscalYearStartMonth}
                onChange={(e) =>
                  setSettings({ ...settings, fiscalYearStartMonth: Number(e.target.value) })
                }
                className="w-full px-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
              >
                <option value={4}>April (Indian Standard: Apr–Mar)</option>
                <option value={1}>January (Calendar: Jan–Dec)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Lapsed Customer Days</label>
              <input
                type="number"
                value={settings.lapsedDays}
                onChange={(e) =>
                  setSettings({ ...settings, lapsedDays: Number(e.target.value) })
                }
                className="w-full px-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
              />
              <span className="text-[10px] text-ink-3 mt-1 block">
                Flagged as lapsed if no invoice in this many days
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Fuzzy Match Threshold</label>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="1.0"
                value={settings.fuzzyThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, fuzzyThreshold: Number(e.target.value) })
                }
                className="w-full px-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
              />
              <span className="text-[10px] text-ink-3 mt-1 block">
                Similarity score (0.0 to 1.0) to suggest customer/product match
              </span>
            </div>
          </div>
        </div>

        {/* LLM Providers (Only visible in administrator profile) */}
        {isAdmin && (
          <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-ink">LLM Extraction Providers</h3>
              </div>
              <span className="text-[11px] text-ink-3">Configured via .env on server</span>
            </div>

            <p className="text-xs text-ink-3">
              Invoices are extracted using providers in the order below. If a provider reaches rate limits or errors,
              the system automatically falls back to the next provider.
            </p>

            <div className="space-y-2">
              {settings.providerOrder.map((providerId, index) => {
                const prov = providers.find((p) => p.id === providerId) || {
                  id: providerId,
                  name: providerId.toUpperCase(),
                  isConfigured: false,
                  model: "Not configured",
                };
                const result = testResult[providerId];

                return (
                  <div
                    key={providerId}
                    className="flex items-center justify-between p-3 bg-bg border border-border rounded-sm text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => moveProvider(index, "up")}
                          disabled={index === 0}
                          className="text-ink-3 hover:text-ink disabled:opacity-20"
                          title="Move up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveProvider(index, "down")}
                          disabled={index === settings.providerOrder.length - 1}
                          className="text-ink-3 hover:text-ink disabled:opacity-20"
                          title="Move down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          <span>
                            {index + 1}. {prov.name}
                          </span>
                          {prov.isConfigured ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-sm text-[10px] bg-success-bg text-success font-normal">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Configured</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-sm text-[10px] bg-surface-2 text-ink-3 font-normal">
                              <XCircle className="w-2.5 h-2.5" />
                              <span>Not configured (key blank)</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-ink-3 mt-0.5">
                          Model: {prov.model}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {result && (
                        <span
                          className={`text-[11px] ${
                            result.ok ? "text-success font-medium" : "text-danger"
                          }`}
                        >
                          {result.message}
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={!prov.isConfigured || testingProvider === providerId}
                        onClick={() => handleTestProvider(providerId)}
                        className="px-2.5 py-1 bg-surface border border-border text-ink rounded-sm text-[11px] font-medium hover:bg-surface-2 transition disabled:opacity-40"
                      >
                        {testingProvider === providerId ? (
                          <RefreshCw className="w-3 h-3 animate-spin inline" />
                        ) : (
                          "Test connection"
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* WhatsApp Gateway Integration */}
        <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold text-ink">WhatsApp Gateway</h3>
              </div>
            </div>

            {waStatus.status === "CONNECTED" ? null : waStatus.status === "QR_READY" ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-medium border border-amber-500/20 w-fit">
                <QrCode className="w-3.5 h-3.5 animate-pulse" />
                <span>Ready to Link</span>
              </div>
            ) : waStatus.status === "CONNECTING" ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-ink-2 text-[11px] font-medium border border-border w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Connecting...</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-ink-3 text-[11px] font-medium border border-border w-fit">
                <XCircle className="w-3.5 h-3.5" />
                <span>Not Linked</span>
              </div>
            )}
          </div>

          <div className="bg-bg border border-border rounded-sm p-4 space-y-4">
            {waStatus.status === "CONNECTED" ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-ink flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Active Linked WhatsApp: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{waStatus.phoneNumber}</strong></span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnectWhatsApp}
                  disabled={waLoading}
                  className="px-3 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 rounded-sm text-xs font-medium transition disabled:opacity-50 self-start sm:self-auto cursor-pointer"
                >
                  {waLoading ? "Unlinking..." : "Unlink WhatsApp"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Method Switcher Tabs */}
                <div className="flex items-center gap-1 border-b border-border pb-2">
                  <button
                    type="button"
                    onClick={() => setLinkTab("qr")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-sm flex items-center gap-2 transition cursor-pointer",
                      linkTab === "qr"
                        ? "bg-surface text-ink border border-border shadow-xs"
                        : "text-ink-3 hover:text-ink hover:bg-surface/50"
                    )}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Scan QR Code</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLinkTab("code")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-sm flex items-center gap-2 transition cursor-pointer",
                      linkTab === "code"
                        ? "bg-surface text-ink border border-border shadow-xs"
                        : "text-ink-3 hover:text-ink hover:bg-surface/50"
                    )}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Link with Phone Number (8-Digit Code)</span>
                  </button>
                </div>

                {/* TAB 1: QR CODE */}
                {linkTab === "qr" && (
                  <div>
                    {waStatus.status === "QR_READY" && waStatus.qrCode ? (
                      <div className="flex flex-col md:flex-row items-center gap-6 p-2">
                        <div className="bg-white p-3 rounded-md border border-border shadow-xs flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={waStatus.qrCode}
                            alt="Scan WhatsApp QR Code"
                            className="w-52 h-52 object-contain"
                          />
                        </div>

                        <div className="space-y-3 text-xs">
                          <div>
                            <h4 className="font-semibold text-ink text-sm">Scan QR Code with WhatsApp</h4>
                            <p className="text-ink-3 text-[11px] mt-0.5">
                              Link FlowPilot once as a companion device. Session persists safely in your database across restarts.
                            </p>
                          </div>

                          <ol className="space-y-1.5 list-decimal list-inside text-ink-2 text-xs">
                            <li>Open <strong>WhatsApp</strong> on your phone</li>
                            <li>Tap <strong>Menu</strong> (Android 3 dots) or <strong>Settings</strong> (iPhone)</li>
                            <li>Tap <strong>Linked Devices</strong> and then <strong>Link a Device</strong></li>
                            <li>Point your camera at this QR code to link</li>
                          </ol>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleRefreshWhatsAppQR}
                              disabled={waLoading}
                              className="px-3 py-1 bg-surface border border-border text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <RefreshCw className={cn("w-3 h-3", waLoading && "animate-spin")} />
                              <span>Refresh QR</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setLinkTab("code")}
                              className="px-3 py-1 text-emerald-600 dark:text-emerald-400 hover:underline text-xs transition"
                            >
                              Camera issue? Use pairing code instead &rarr;
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : waLoading || waStatus.status === "CONNECTING" ? (
                      <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-3">
                        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                        <div className="text-sm font-semibold text-ink">Connecting to WhatsApp...</div>
                        <p className="text-xs text-ink-3 max-w-sm">
                          Establishing a secure WebSocket session and generating your one-time pairing QR code. Please wait a few seconds...
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-ink flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-ink-3" />
                            <span>No WhatsApp Device Linked</span>
                          </div>
                          <p className="text-[11px] text-ink-3 max-w-xl">
                            Click below to generate a one-time QR code. FlowPilot will send statement PDFs and reminder messages directly to customer phone numbers in the background.
                          </p>
                          {waStatus.lastError && (
                            <div className="text-danger text-[11px] font-medium pt-1">
                              {waStatus.lastError}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleRefreshWhatsAppQR}
                          disabled={waLoading}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-xs font-medium transition shadow-xs flex items-center gap-2 self-start sm:self-auto cursor-pointer disabled:opacity-50"
                        >
                          {waLoading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Generating QR...</span>
                            </>
                          ) : (
                            <>
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Generate QR Code</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: PAIRING CODE (PHONE NUMBER) */}
                {linkTab === "code" && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-ink text-sm">Link via 8-Digit Code</h4>
                      <p className="text-[11px] text-ink-3 max-w-xl">
                        WhatsApp allows you to link directly without scanning with your camera. Enter your phone number below to receive an 8-character verification code to enter on your phone.
                      </p>
                    </div>

                    {!pairingCode ? (
                      <form onSubmit={handleRequestPairingCode} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-md pt-1">
                        <input
                          type="tel"
                          placeholder="e.g. 9830123456 or +91 9830123456"
                          value={pairingPhone}
                          onChange={(e) => setPairingPhone(e.target.value)}
                          className="flex-1 px-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-primary"
                          required
                        />
                        <button
                          type="submit"
                          disabled={pairingCodeLoading || !pairingPhone.trim()}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-xs font-medium transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {pairingCodeLoading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Generating Code...</span>
                            </>
                          ) : (
                            <span>Get Pairing Code</span>
                          )}
                        </button>
                      </form>
                    ) : (
                      <div className="space-y-4 p-4 bg-surface border border-border rounded-sm max-w-lg">
                        <div className="text-center space-y-1">
                          <span className="text-[11px] text-ink-3 uppercase tracking-wider font-semibold">Your One-Time WhatsApp Pairing Code</span>
                          <div className="text-3xl font-mono font-bold tracking-widest text-emerald-600 dark:text-emerald-400 py-2 select-all">
                            {pairingCode}
                          </div>
                        </div>

                        <div className="border-t border-border pt-3 space-y-2 text-xs">
                          <div className="font-semibold text-ink">Instructions to enter code on your phone:</div>
                          <ol className="space-y-1.5 list-decimal list-inside text-ink-2 text-xs">
                            <li>Open <strong>WhatsApp</strong> on your phone</li>
                            <li>Tap <strong>Menu</strong> (Android 3 dots) or <strong>Settings</strong> (iPhone)</li>
                            <li>Tap <strong>Linked Devices</strong> and then <strong>Link a Device</strong></li>
                            <li>At the bottom of the camera screen, tap <strong>&ldquo;Link with phone number instead&rdquo;</strong></li>
                            <li>Type in the 8-digit code shown above: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{pairingCode}</strong></li>
                          </ol>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <div className="flex items-center gap-2 text-[11px] text-ink-3">
                            <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
                            <span>Waiting for you to enter code on phone...</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPairingCode(null)}
                            className="text-xs text-ink-3 hover:text-ink underline cursor-pointer"
                          >
                            Enter different number
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Profile Backup & Disaster Recovery */}
        <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-ink">Data & Profile Backup</h3>
                <p className="text-[11px] text-ink-3">Automated end-of-day snapshots and on-demand profile export</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/20 w-fit">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Daily Automated Backups Active</span>
            </div>
          </div>

          <div className="bg-bg border border-border rounded-sm p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ink-3" />
                  <span>
                    Last Backup:{" "}
                    {backupInfo?.latest?.timestamp
                      ? new Date(backupInfo.latest.timestamp).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Pending initial run"}
                  </span>
                </div>
                {backupInfo?.latest?.counts && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-ink-2">
                      Invoices: <strong className="text-ink">{backupInfo.latest.counts.invoices ?? 0}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-ink-2">
                      Purchases: <strong className="text-ink">{backupInfo.latest.counts.purchases ?? 0}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-ink-2">
                      Customers: <strong className="text-ink">{backupInfo.latest.counts.customers ?? 0}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-ink-2">
                      Products: <strong className="text-ink">{backupInfo.latest.counts.products ?? 0}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-ink-2">
                      Ledger Accounts: <strong className="text-ink">{backupInfo.latest.counts.ledgerAccounts ?? 0}</strong>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="/api/admin/backup?action=download"
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-fg rounded-sm text-xs font-medium hover:opacity-90 transition shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Backup (.json)</span>
                </a>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restore / Sync from Prod</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleRestoreFile}
                    disabled={backupTriggering}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleTriggerBackup}
                  disabled={backupTriggering}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", backupTriggering && "animate-spin")} />
                  <span>{backupTriggering ? "Backing up..." : "Backup Now"}</span>
                </button>
              </div>
            </div>

            {backupMessage && (
              <div className="p-2.5 bg-surface-2 border border-border text-ink rounded text-xs flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span>{backupMessage}</span>
              </div>
            )}
          </div>


        </div>

        {saveSuccess && (
          <div className="p-3 bg-success-bg text-success border border-success/30 rounded-sm text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings saved successfully.</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-primary text-primary-fg rounded-sm text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
