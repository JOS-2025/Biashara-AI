import { useState, useEffect } from "react";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { X, Package, Save, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "./Toast";

interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
  totalSold: number;
  totalBought: number;
  unit: string;
  userId: string;
  createdAt: any;
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export default function ProductModal({ isOpen, onClose, product }: ProductModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "General",
    stock: 0,
    unit: "pcs",
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        category: product.category || "General",
        stock: product.stock,
        unit: product.unit,
      });
    } else {
      setFormData({
        name: "",
        category: "General",
        stock: 0,
        unit: "pcs",
      });
    }
  }, [product, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.name.trim()) {
      showToast("Product name is required", "error");
      return;
    }

    setLoading(true);
    try {
      if (product) {
        // Update existing product
        await updateDoc(doc(db, "products", product.id), {
          name: formData.name.trim(),
          category: formData.category.trim(),
          stock: Number(formData.stock),
          unit: formData.unit.trim(),
          updatedAt: new Date().toISOString()
        });
        showToast("Product updated successfully", "success");
      } else {
        // Add new product
        await addDoc(collection(db, "products"), {
          name: formData.name.trim(),
          category: formData.category.trim(),
          stock: Number(formData.stock),
          totalSold: 0,
          totalBought: Number(formData.stock), // Initial stock is considered bought
          unit: formData.unit.trim(),
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
        showToast("Product added successfully", "success");
      }
      onClose();
    } catch (error: any) {
      console.error("Error saving product:", error);
      if (error.message && error.message.includes('permission')) {
        handleFirestoreError(error, OperationType.WRITE, "products");
      }
      showToast("Failed to save product", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-xl">
                <Package className="w-5 h-5 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {product ? "Edit Product" : "New Product"}
              </h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Product Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Cement, Paint, Nails"
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white transition-all outline-none"
                >
                  <option value="General">General</option>
                  <option value="Construction">Construction</option>
                  <option value="Hardware">Hardware</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Tools">Tools</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Unit
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="pcs, kg, bags"
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white transition-all outline-none"
                  />
                </div>
              </div>

              {product && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Editing initial stock directly will overwrite current stock. 
                    For regular inventory updates, use the "Add Transaction" feature.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-emerald-600/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>{product ? "Update Product" : "Save Product"}</span>
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
