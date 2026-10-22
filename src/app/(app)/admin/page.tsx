"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Building2,
  Plus,
  Users,
  Eye,
  Lock,
  CheckCircle2,
  Sliders,
  RefreshCw,
  ExternalLink,
  Receipt,
  Package,
  Layers,
  ArrowRight,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ClientRecord {
  id: string;
  name: string;
  username: string;
  gstin?: string;
  tradeName?: string;
  email?: string;
  phone?: string;
  address?: string;
  state?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  isFoundingClient?: boolean;
  stats: {
    totalInvoices: number;
    totalPurchases: number;
    totalCustomers: number;
    totalSuppliers: number;
    totalProducts: number;
    totalRevenue: string;
  };
}

export default function AdminPortalPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [switchingClientId, setSwitchingClientId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [gstin, setGstin] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("West Bengal");

  const loadClients = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/clients");
      if (!res.ok) {
        if (res.status === 403) {
          router.push("/dashboard");
          return;
        }
        throw new Error("Failed to load clients");
      }
      const data = await res.json();
      if (data.data) {
        setClients(data.data);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter client/company name");
    if (!username.trim()) return setError("Please enter login username");
    if (!password.trim()) return setError("Please enter login password");

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          password: password.trim(),
          gstin: gstin.trim() || undefined,
          tradeName: tradeName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          state: state.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create client");
      }

      setSuccessMsg(`Client profile '${name}' created successfully!`);
      setIsModalOpen(false);
      setName("");
      setUsername("");
      setPassword("");
      setGstin("");
      setTradeName("");
      setEmail("");
      setPhone("");
      await loadClients();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err?.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInspectWorkspace = async (clientId: string) => {
    setSwitchingClientId(clientId);
    try {
      const res = await fetch("/api/admin/switch-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(data.redirectUrl || "/dashboard");
        router.refresh();
      } else {
        alert(data.error?.message || "Failed to switch workspace");
        setSwitchingClientId(null);
      }
    } catch (err) {
      console.error(err);
      alert("Error switching workspace");
      setSwitchingClientId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                Administrator Portal
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Multi-tenant client workspace management & privacy isolation control center.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span>LLM & Server Settings</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Client</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Registered Clients</span>
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {clients.length}
          </div>
          <span className="text-[11px] text-muted-foreground">
            Fully isolated data workspaces
          </span>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Data Privacy Status</span>
            <Lock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            Protected
          </div>
          <span className="text-[11px] text-muted-foreground">
            Zero cross-client data sharing
          </span>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Admin Mode</span>
            <Eye className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            Read-Only
          </div>
          <span className="text-[11px] text-muted-foreground">
            Only clients perform write changes
          </span>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Founding Client</span>
            <Layers className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground truncate">
            Indobest
          </div>
          <span className="text-[11px] text-muted-foreground">
            Primary GST Workspace
          </span>
        </div>
      </div>

      {/* Client List Section */}
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div>
            <h2 className="text-sm font-bold text-foreground">Client Workspaces</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select a client to inspect their invoices, stock inventory, and party ledgers in read-only mode.
            </p>
          </div>
          <button
            type="button"
            onClick={loadClients}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading client workspaces...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            No clients registered yet. Click &quot;Add New Client&quot; above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map((client) => {
              const isSwitching = switchingClientId === client.id;
              return (
                <div
                  key={client.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 font-bold text-sm">
                      {client.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">
                          {client.name}
                        </span>
                        {client.isFoundingClient && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20">
                            Founding Client
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {client.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                        <span>Username: <strong className="text-foreground font-mono">{client.username}</strong></span>
                        <span>•</span>
                        <span>GSTIN: <span className="font-mono text-foreground font-medium">{client.gstin || "Not provided"}</span></span>
                        {client.state && (
                          <>
                            <span>•</span>
                            <span>{client.state}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Client Stats & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 shrink-0">
                    <div className="grid grid-cols-3 gap-3 text-center py-2 px-3.5 bg-muted/40 rounded-xl border border-border/60">
                      <div>
                        <span className="block text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Invoices</span>
                        <span className="text-xs font-bold text-foreground">{client.stats.totalInvoices}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Customers</span>
                        <span className="text-xs font-bold text-foreground">{client.stats.totalCustomers}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Products</span>
                        <span className="text-xs font-bold text-foreground">{client.stats.totalProducts}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleInspectWorkspace(client.id)}
                      disabled={isSwitching}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface border border-border text-foreground hover:bg-primary hover:text-primary-foreground text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSwitching ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>Inspect Workspace</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm text-foreground">Add New Client Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-medium">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Client / Company Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Apex Chemicals Pvt Ltd"
                    required
                    className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Login Username *
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. apex_chem"
                    required
                    className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Used to sign in to this client workspace
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Login Password *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 4 characters"
                    required
                    className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 19AAACA1234A1Z5"
                    maxLength={15}
                    className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    State (Optional)
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. West Bengal"
                    className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Contact Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Contact Phone (Optional)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98300 00000"
                    className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50 border border-border text-[11px] text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-primary" />
                  <span>Strict Data Privacy Guarantee</span>
                </div>
                <p>
                  This client will operate in complete privacy. They cannot view or access data from Indobest or any other client. Only the administrator can inspect their workspace.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-primary-fg border-t-transparent rounded-full animate-spin" />
                      <span>Creating Client...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Client Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
