"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { ProductDetailView } from "@/components/products/ProductDetailView";

export default function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [product, setProduct] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) {
        throw new Error("Failed to load product details");
      }
      const data = await res.json();
      setProduct(data.product);
      setStats(data.stats);
    } catch (err: any) {
      setError(err.message || "Error loading product");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
  }, [id]);

  if (loading) {
    return (
      <div className="py-16 text-center text-ink-3 text-xs">
        Loading product purchase and sales details...
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-danger text-sm">{error || "Product not found"}</p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Products Master
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <Link href="/products" className="hover:text-ink transition flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Products
        </Link>
        <span>/</span>
        <span className="font-mono text-ink">{product.code}</span>
      </div>

      <ProductDetailView product={product} stats={stats} />
    </div>
  );
}
