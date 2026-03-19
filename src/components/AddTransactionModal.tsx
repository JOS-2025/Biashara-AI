import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus, Loader2, X, Package } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./Toast";

const CATEGORIES = [
  "sales", "other income", "stock", "rent", "transport", "salary", "utilities", "marketing", "other"
];

interface Product {
  id: string;
  name: string;
  stock: number;
  unit: string;
}

interface AddTransactionModalProps {
  onSuccess: () => void;
}

const EMPTY_FORM = {
  type: 'sale' as 'sale' | 'expense',
  amount: '',
  category: 'sales',
  description: '',
  productId: '',
  quantity: ''
};

export default function AddTransactionModal({ onSuccess }: AddTransactionModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState(EMPTY_FORM);

  /**
   * Fetch the user's products whenever the modal opens so the
   * product selector always reflects the latest inventory.
   */
  useEffect(() => {
    if (!open || !user) return;

    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock, unit")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching products:", error.message);
      } else {
        setProducts((data as Product[]) ?? []);
      }
    };

    fetchProducts();
  }, [open, user]);

  const handleClose = () => {
    setOpen(false);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;

    if (!user) {
      showToast("Please log in to add transactions.", "error");
      return;
    }

    setLoading(true);
    try {
      const amount = parseFloat(formData.amount);
      const quantity = formData.quantity ? parseFloat(formData.quantity) : null;

      // ── 1. Insert the transaction row ──────────────────────────────────
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          type: formData.type,
          amount,
          category: formData.category,
          description: formData.description,
          product_id: formData.productId || null,
          quantity: quantity ?? null,
          created_at: new Date().toISOString(),
        });

      if (txError) throw txError;

      // ── 2. Update product stock when a product is linked ──────────────
      //
      // Supabase has no cross-table atomic transactions in the client SDK.
      // We do two sequential writes. For true atomicity, use a Postgres RPC
      // (see Chat.tsx for a ready-made SQL function template).
      if (formData.productId && quantity) {
        const linkedProduct = products.find(p => p.id === formData.productId);
        if (!linkedProduct) throw new Error("Selected product no longer exists.");

        const isSale = formData.type === 'sale';
        const isStockExpense = formData.type === 'expense' && formData.category === 'stock';

        // Only mutate stock for sales or stock-replenishment expenses
        if (isSale || isStockExpense) {
          // Fetch the freshest values to avoid stomping concurrent updates
          const { data: fresh, error: fetchErr } = await supabase
            .from("products")
            .select("stock, total_sold, total_bought")
            .eq("id", formData.productId)
            .eq("user_id", user.id)
            .single();

          if (fetchErr || !fresh) throw new Error("Could not read product for stock update.");

          const stockDelta  = isSale ? -quantity : quantity;
          const soldDelta   = isSale ?  quantity : 0;
          const boughtDelta = isStockExpense ? quantity : 0;

          const { error: stockErr } = await supabase
            .from("products")
            .update({
              stock:        fresh.stock        + stockDelta,
              total_sold:   fresh.total_sold   + soldDelta,
              total_bought: fresh.total_bought + boughtDelta,
              updated_at:   new Date().toISOString(),
            })
            .eq("id", formData.productId)
            .eq("user_id", user.id); // RLS ownership guard

          if (stockErr) throw stockErr;
        }
      }

      showToast("Transaction saved successfully!", "success");
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error("Error saving transaction:", error);
      const isPermissionError =
        error?.code === "42501" ||
        error?.message?.includes("permission") ||
        error?.message?.includes("denied");

      showToast(
        isPermissionError
          ? "Permission denied. Please check your login status."
          : "Failed to save transaction. Please check your connection.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-full bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 gap-2"
      >
        <Plus className="w-5 h-5" />
        <span className="hidden sm:inline">Add Transaction</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-slate-900">Add Transaction</h2>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {/* Sale / Expense toggle */}
              <div className="flex p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'sale', category: 'sales' }))}
                  className={cn(
                    "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                    formData.type === 'sale' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Sale
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'expense', category: 'stock' }))}
                  className={cn(
                    "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                    formData.type === 'expense' ? "bg-white text-red-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Expense
                </button>
              </div>

              {/* Amount + Category */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Amount (KES)
                  </label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat} className="capitalize">{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  Link to Product (Optional)
                </label>
                <select
                  value={formData.productId}
                  onChange={(e) => {
                    const prodId = e.target.value;
                    const prod = products.find(p => p.id === prodId);
                    setFormData(prev => ({
                      ...prev,
                      productId: prodId,
                      description: prod
                        ? `${prev.type === 'sale' ? 'Sold' : 'Bought'} ${prod.name}`
                        : prev.description
                    }));
                  }}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="">No product selected</option>
                  {products.map(prod => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} (Stock: {prod.stock} {prod.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity — only shown when a product is linked */}
              {formData.productId && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Quantity
                  </label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      placeholder="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                      className="rounded-xl border-slate-200 focus:ring-emerald-500"
                      required={!!formData.productId}
                    />
                    <span className="text-sm text-slate-500 font-medium">
                      {products.find(p => p.id === formData.productId)?.unit}
                    </span>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Description
                </label>
                <Input
                  placeholder="e.g. Sold 2 bags of maize"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 h-12 font-bold text-lg"
                disabled={loading}
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin mr-2" />}
                Save Transaction
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
