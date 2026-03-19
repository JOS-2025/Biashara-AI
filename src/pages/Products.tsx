import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { Plus, Search, Package, Trash2, Edit2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ProductModal from "../components/ProductModal";
import { useToast } from "../components/Toast";

interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
  total_sold: number;
  total_bought: number;
  unit: string;
  user_id: string;
  created_at: string;
}

export default function Products() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  /**
   * Fetches all products for the current user, ordered by creation date
   * descending. Called on mount; real-time events keep the list current
   * after the initial load.
   */
  const loadProducts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("id, name, category, stock, total_sold, total_bought, unit, user_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching products:", error.message);
      showToast("Failed to load products. Please check your connection.", "error");
    } else {
      setProducts((data as Product[]) ?? []);
    }

    setLoading(false);
  }, [user, showToast]);

  /**
   * Initial fetch + real-time subscription.
   *
   * INSERT  → prepend new product (preserves desc order)
   * UPDATE  → replace the matching product in-place
   * DELETE  → remove the matching product
   *
   * The channel is filtered server-side by user_id so only the current
   * user's rows are pushed to this client. Cleaned up on unmount.
   */
  useEffect(() => {
    if (!user) return;

    loadProducts();

    const channel = supabase
      .channel(`products:user_id=eq.${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setProducts((prev) => [payload.new as Product, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setProducts((prev) =>
              prev.map((p) =>
                p.id === (payload.new as Product).id ? (payload.new as Product) : p
              )
            );
          } else if (payload.eventType === "DELETE") {
            setProducts((prev) =>
              prev.filter((p) => p.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadProducts]);

  /**
   * Deletes a product row by primary key.
   * The real-time subscription will remove it from local state automatically
   * via the DELETE event, so no manual state update is needed here.
   */
  const handleDelete = async (productId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this product? This will not delete associated transactions."
      )
    )
      return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) {
      console.error("Error deleting product:", error.message);
      showToast("Failed to delete product", "error");
    } else {
      showToast("Product deleted successfully", "success");
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    const matchesStock =
      stockFilter === "All" ||
      (stockFilter === "Low Stock" && p.stock <= 5) ||
      (stockFilter === "In Stock" && p.stock > 5);

    return matchesSearch && matchesCategory && matchesStock;
  });

  const categories = [
    "All",
    ...Array.from(new Set(products.map((p) => p.category || "General"))),
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
          <button
            onClick={() => {
              setSelectedProduct(null);
              setIsModalOpen(true);
            }}
            className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-[10px] uppercase font-bold text-slate-400 px-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-100 border-none rounded-lg text-xs py-1.5 px-2 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-[10px] uppercase font-bold text-slate-400 px-1">
              Stock Level
            </label>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="bg-slate-100 border-none rounded-lg text-xs py-1.5 px-2 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="All">All Levels</option>
              <option value="Low Stock">Low Stock (≤5)</option>
              <option value="In Stock">In Stock ({">"}5)</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-500 text-sm">Loading inventory...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-slate-100 p-4 rounded-full mb-4">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-slate-900 font-medium mb-1">No products found</h3>
            <p className="text-slate-500 text-sm max-w-[200px]">
              {searchQuery
                ? "Try a different search term"
                : "Add your first product to start tracking inventory"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-slate-900">{product.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase">
                          {product.category || "General"}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                          Unit: {product.unit}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedProduct(product);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Stock</p>
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-lg font-bold ${
                            product.stock <= 5 ? "text-red-600" : "text-slate-900"
                          }`}
                        >
                          {product.stock}
                        </span>
                        {product.stock <= 5 && (
                          <AlertCircle className="w-3 h-3 text-red-600" />
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Sold</p>
                      <p className="text-lg font-bold text-slate-900">{product.total_sold}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Bought</p>
                      <p className="text-lg font-bold text-slate-900">{product.total_bought}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={selectedProduct}
      />
    </div>
  );
}
