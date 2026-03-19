import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus, Loader2, X, Package } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, addDoc, query, where, getDocs, runTransaction, doc } from "firebase/firestore";
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

export default function AddTransactionModal({ onSuccess }: AddTransactionModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState({
    type: 'sale' as 'sale' | 'expense',
    amount: '',
    category: 'sales',
    description: '',
    productId: '',
    quantity: ''
  });

  useEffect(() => {
    if (open && user) {
      const fetchProducts = async () => {
        try {
          const q = query(collection(db, "products"), where("userId", "==", user.uid));
          const snapshot = await getDocs(q);
          const productsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Product[];
          setProducts(productsData);
        } catch (error) {
          console.error("Error fetching products:", error);
        }
      };
      fetchProducts();
    }
  }, [open, user]);

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
      const quantity = formData.quantity ? parseFloat(formData.quantity) : 0;

      await runTransaction(db, async (transaction) => {
        // 1. Create the transaction document
        const transactionRef = doc(collection(db, "transactions"));
        transaction.set(transactionRef, {
          userId: user.uid,
          type: formData.type,
          amount: amount,
          category: formData.category,
          description: formData.description,
          productId: formData.productId || null,
          quantity: quantity || null,
          createdAt: new Date().toISOString()
        });

        // 2. Update product stock if a product is selected
        if (formData.productId) {
          const productRef = doc(db, "products", formData.productId);
          const productDoc = await transaction.get(productRef);
          
          if (!productDoc.exists()) {
            throw new Error("Product does not exist!");
          }

          const productData = productDoc.data();
          const currentStock = productData.stock || 0;
          const currentSold = productData.totalSold || 0;
          const currentBought = productData.totalBought || 0;

          if (formData.type === 'sale') {
            transaction.update(productRef, {
              stock: currentStock - quantity,
              totalSold: currentSold + quantity
            });
          } else if (formData.type === 'expense' && formData.category === 'stock') {
            transaction.update(productRef, {
              stock: currentStock + quantity,
              totalBought: currentBought + quantity
            });
          }
        }
      });

      showToast("Transaction saved successfully!", "success");
      setOpen(false);
      setFormData({ 
        type: 'sale', 
        amount: '', 
        category: 'sales', 
        description: '',
        productId: '',
        quantity: ''
      });
      onSuccess();
    } catch (error) {
      showToast("Failed to save transaction. Please check your connection.", "error");
      handleFirestoreError(error, OperationType.CREATE, "transactions");
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
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Amount (KES)</label>
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
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Category</label>
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
                      description: prod ? `${prev.type === 'sale' ? 'Sold' : 'Bought'} ${prod.name}` : prev.description
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

              {formData.productId && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantity</label>
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

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
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
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Save Transaction
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
