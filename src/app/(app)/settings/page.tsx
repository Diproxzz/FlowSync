"use client";

import { useEffect, useState } from "react";
import { Building2, Sliders, Cpu, CheckCircle2, XCircle, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ [id: string]: { ok: boolean; message: string } }>({});

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (data.providers) setProviders(data.providers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

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
      <div>
        <h2 className="text-xl font-semibold text-ink">System Settings</h2>
        <p className="text-xs text-ink-3">Issuer company details, inventory defaults, and free-tier LLM configuration</p>
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

        {/* LLM Providers */}
        <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-ink">Free-Tier LLM Extraction Providers</h3>
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
