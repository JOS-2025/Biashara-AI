import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2, X, Trash2, Package } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, runTransaction, collection, query, where, getDocs } from "firebase/firestore";
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

interface Transaction {
  id: string;
  type: 'sale' | 'expense';
  amount: number;
  category: string;
  description: string;
  created_at: string;
  productId?: string;
  quantity?: number;
}

interface EditTransactionModalProps {
  transaction: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditTransactionModal({ transaction, onClose, onSuccess }: EditTransactionModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState({
    type: transaction.type,
    amount: transaction.amount.toString(),
    category: transaction.category,
    description: transaction.description,
    productId: transaction.productId || '',
    quantity: transaction.quantity?.toString() || ''
  });

  useEffect(() => {
    if (user) {
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
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;

    if (!user) {
      showToast("Please log in to update transactions.", "error");
      return;
    }

    setLoading(true);
    try {
      const newAmount = parseFloat(formData.amount);
      const newQuantity = formData.quantity ? parseFloat(formData.quantity) : 0;
      const newProductId = formData.productId || null;

      await runTransaction(db, async (dbTransaction) => {
        // 1. Get the current transaction data (to be sure)
        const transactionRef = doc(db, "transactions", transaction.id);
        const transactionDoc = await dbTransaction.get(transactionRef);
        
        if (!transactionDoc.exists()) {
          throw new Error("Transaction does not exist!");
        }

        const oldData = transactionDoc.data();
        const oldProductId = oldData.productId;
        const oldQuantity = oldData.quantity || 0;
        const oldType = oldData.type;
        const oldCategory = oldData.category;

        // 2. Reverse old product stock impact
        if (oldProductId) {
          const oldProductRef = doc(db, "products", oldProductId);
          const oldProductDoc = await dbTransaction.get(oldProductRef);
          
          if (oldProductDoc.exists()) {
            const oldProductData = oldProductDoc.data();
            let updatedStock = oldProductData.stock || 0;
            let updatedSold = oldProductData.totalSold || 0;
            let updatedBought = oldProductData.totalBought || 0;

            if (oldType === 'sale') {
              updatedStock += oldQuantity;
              updatedSold -= oldQuantity;
            } else if (oldType === 'expense' && oldCategory === 'stock') {
              updatedStock -= oldQuantity;
              updatedBought -= oldQuantity;
            }

            dbTransaction.update(oldProductRef, {
              stock: updatedStock,
              totalSold: updatedSold,
              totalBought: updatedBought
            });
          }
        }

        // 3. Apply new product stock impact
        if (newProductId) {
          const newProductRef = doc(db, "products", newProductId);
          const newProductDoc = await dbTransaction.get(newProductRef);
          
          if (newProductDoc.exists()) {
            const newProductData = newProductDoc.data();
            let updatedStock = newProductData.stock || 0;
            let updatedSold = newProductData.totalSold || 0;
            let updatedBought = newProductData.totalBought || 0;

            if (formData.type === 'sale') {
              updatedStock -= newQuantity;
              updatedSold += newQuantity;
            } else if (formData.type === 'expense' && formData.category === 'stock') {
              updatedStock += newQuantity;
              updatedBought += newQuantity;
            }

            dbTransaction.update(newProductRef, {
              stock: updatedStock,
              totalSold: updatedSold,
              totalBought: updatedBought
            });
          }
        }

        // 4. Update the transaction document
        dbTransaction.update(transactionRef, {
          type: formData.type,
          amount: newAmount,
          category: formData.category,
          description: formData.description,
          productId: newProductId,
          quantity: newQuantity || null,
        });
      });

      showToast("Transaction updated successfully!", "success");
      onSuccess();
      onClose();
    } catch (error) {
      showToast("Failed to update transaction.", "error");
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${transaction.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user) {
      showToast("Please log in to delete transactions.", "error");
      return;
    }

    setDeleting(true);
    try {
      await runTransaction(db, async (dbTransaction) => {
        const transactionRef = doc(db, "transactions", transaction.id);
        const transactionDoc = await dbTransaction.get(transactionRef);
        
        if (!transactionDoc.exists()) {
          throw new Error("Transaction does not exist!");
        }

        const oldData = transactionDoc.data();
        const oldProductId = oldData.productId;
        const oldQuantity = oldData.quantity || 0;
        const oldType = oldData.type;
        const oldCategory = oldData.category;

        // Reverse product stock impact
        if (oldProductId) {
          const oldProductRef = doc(db, "products", oldProductId);
          const oldProductDoc = await dbTransaction.get(oldProductRef);
          
          if (oldProductDoc.exists()) {
            const oldProductData = oldProductDoc.data();
            let updatedStock = oldProductData.stock || 0;
            let updatedSold = oldProductData.totalSold || 0;
            let updatedBought = oldProductData.totalBought || 0;

            if (oldType === 'sale') {
              updatedStock += oldQuantity;
              updatedSold -= oldQuantity;
            } else if (oldType === 'expense' && oldCategory === 'stock') {
              updatedStock -= oldQuantity;
              updatedBought -= oldQuantity;
            }

            dbTransaction.update(oldProductRef, {
              stock: updatedStock,
              totalSold: updatedSold,
              totalBought: updatedBought
            });
          }
        }

        // Delete the transaction
        dbTransaction.delete(transactionRef);
      });

      showToast("Transaction deleted successfully!", "success");
      onSuccess();
      onClose();
    } catch (error) {
      showToast("Failed to delete transaction.", "error");
      handleFirestoreError(error, OperationType.DELETE, `transactions/${transaction.id}`);
    } finally {
      setDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-slate-900">Edit Transaction</h2>
          <button 
            onClick={onClose}
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

          <div className="flex gap-3 pt-2">
            <Button 
              type="button"
              variant="outline"
              onClick={() => setShowConfirmDelete(true)}
              className="flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50 h-12 font-bold"
              disabled={deleting || loading}
            >
              <Trash2 className="w-5 h-5 mr-2" />
              Delete
            </Button>
            <Button 
              type="submit" 
              className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700 h-12 font-bold text-lg"
              disabled={loading || deleting}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Update
            </Button>
          </div>
        </form>

        {showConfirmDelete && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center p-6 bg-white/90 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Transaction?</h3>
                <p className="text-sm text-slate-500">This action cannot be undone and will reverse stock changes.</p>
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-xl"
                  onClick={() => setShowConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button 
                  variant="default" 
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
