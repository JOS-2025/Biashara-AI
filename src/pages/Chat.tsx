import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, CheckCircle2, Loader2, Cloud } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { parseTransactionMessage } from "../lib/ai";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  status?: 'sending' | 'success' | 'error';
}

export default function Chat() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hi! I'm Biashara AI. Tell me what you sold or bought today. For example: 'Sold 5 bags of cement for 4500' or 'Bought 10 crates of soda for 6000'. I'll automatically update your stock!",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date(),
      status: 'sending'
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsProcessing(true);

    try {
      // 1. Parse with AI
      const parsed = await parseTransactionMessage(userMsg.text);

      if (!parsed) {
        throw new Error("Could not understand the transaction.");
      }

      if (!user) {
        throw new Error("Please log in to save transactions.");
      }

      // 2. Try to find a matching product by name (fuzzy, client-side)
      let matchedProductId: string | null = null;
      let matchedProductName: string | null = null;
      let matchedProduct: {
        id: string;
        stock: number;
        total_sold: number;
        total_bought: number;
        name: string;
      } | null = null;

      if (parsed.productName && parsed.quantity) {
        const { data: productRows, error: productErr } = await supabase
          .from("products")
          .select("id, name, stock, total_sold, total_bought")
          .eq("user_id", user.id);

        if (productErr) {
          console.error("Product lookup failed:", productErr.message);
        } else if (productRows) {
          const searchName = parsed.productName.toLowerCase();
          const match = productRows.find(
            (p) =>
              p.name.toLowerCase().includes(searchName) ||
              searchName.includes(p.name.toLowerCase())
          );

          if (match) {
            matchedProductId = match.id;
            matchedProductName = match.name;
            matchedProduct = match;
          }
        }
      }

      // 3. Build the transaction payload (snake_case for Supabase)
      const transactionPayload = {
        user_id: user.id,
        type: parsed.type,
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description,
        product_id: matchedProductId ?? null,
        quantity: parsed.quantity ?? null,
        created_at: new Date().toISOString(),
      };

      if (matchedProductId && matchedProduct && parsed.quantity) {
        /**
         * Supabase doesn't have multi-document transactions across tables like
         * Firestore's runTransaction, but we can keep things atomic at the
         * product level by using an RPC (Postgres function) if needed. For
         * most use-cases the two sequential writes below are sufficient and
         * safe because:
         *   a) The inventory update uses the latest DB values (re-fetched above).
         *   b) RLS policies ensure only the owner can mutate their rows.
         *
         * If you need true atomicity, create a Postgres function in Supabase
         * and call it with supabase.rpc('record_transaction', { ... }).
         */
        const quantity = parsed.quantity;
        const newStock =
          parsed.type === 'sale'
            ? matchedProduct.stock - quantity
            : matchedProduct.stock + quantity;
        const newTotalSold =
          parsed.type === 'sale'
            ? matchedProduct.total_sold + quantity
            : matchedProduct.total_sold;
        const newTotalBought =
          parsed.type === 'expense'
            ? matchedProduct.total_bought + quantity
            : matchedProduct.total_bought;

        // Update product stock first
        const { error: stockErr } = await supabase
          .from("products")
          .update({
            stock: newStock,
            total_sold: newTotalSold,
            total_bought: newTotalBought,
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchedProductId)
          .eq("user_id", user.id); // RLS double-check

        if (stockErr) {
          throw new Error(`Failed to update stock: ${stockErr.message}`);
        }

        // Then insert the transaction
        const { error: txErr } = await supabase
          .from("transactions")
          .insert(transactionPayload);

        if (txErr) {
          // Best-effort: attempt to roll back the stock change
          await supabase
            .from("products")
            .update({
              stock: matchedProduct.stock,
              total_sold: matchedProduct.total_sold,
              total_bought: matchedProduct.total_bought,
            })
            .eq("id", matchedProductId)
            .eq("user_id", user.id);

          throw new Error(`Failed to save transaction: ${txErr.message}`);
        }
      } else {
        // No product match — simple insert
        const { error: txErr } = await supabase
          .from("transactions")
          .insert(transactionPayload);

        if (txErr) {
          throw new Error(`Failed to save transaction: ${txErr.message}`);
        }
      }

      showToast("Transaction recorded!", "success");

      // 4. Update user message status
      setMessages(prev =>
        prev.map(m => m.id === userMsg.id ? { ...m, status: 'success' } : m)
      );

      let botResponse = `✅ Recorded: ${parsed.type === 'sale' ? 'Sale' : 'Expense'} of KES ${parsed.amount.toLocaleString()} for ${parsed.category}.`;
      if (matchedProductName && parsed.quantity) {
        botResponse += `\n📦 Updated stock for ${matchedProductName} (${parsed.type === 'sale' ? '-' : '+'}${parsed.quantity})`;
      } else if (parsed.productName && !matchedProductId) {
        botResponse += `\n⚠️ Note: I couldn't find a product named "${parsed.productName}" in your inventory to update stock.`;
      }

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: botResponse,
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);

    } catch (error: any) {
      console.error(error);

      setMessages(prev =>
        prev.map(m => m.id === userMsg.id ? { ...m, status: 'error' } : m)
      );

      const errorText =
        error.message?.includes('permission') || error.message?.includes('denied')
          ? "Permission denied. Please check your login status."
          : error.message ?? "An unexpected error occurred.";

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: `❌ Sorry, I couldn't process that. ${errorText}`,
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 max-w-md mx-auto w-full">
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
          <Bot className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-slate-900">Biashara Assistant</h1>
          <div className="flex items-center gap-2">
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </p>
            <span className="text-[9px] px-1 rounded font-bold uppercase tracking-tighter bg-emerald-100 text-emerald-600 flex items-center gap-1">
              <Cloud className="w-2.5 h-2.5" />
              Syncing
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full",
              msg.sender === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div className={cn(
              "max-w-[80%] rounded-2xl px-4 py-3 shadow-sm",
              msg.sender === 'user'
                ? "bg-emerald-600 text-white rounded-br-sm"
                : "bg-white border border-slate-100 text-slate-900 rounded-bl-sm"
            )}>
              <p className="text-[15px] leading-relaxed whitespace-pre-line">{msg.text}</p>
              <div className={cn(
                "flex items-center justify-end gap-1 mt-1 text-[10px]",
                msg.sender === 'user' ? "text-emerald-100" : "text-slate-400"
              )}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.sender === 'user' && (
                  msg.status === 'sending' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                  msg.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> :
                  <span className="text-red-300">Failed</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex w-full justify-start">
            <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Paid salary 5000 or Marketing 2000"
            className="rounded-full bg-slate-100 border-transparent focus-visible:ring-emerald-500/50 focus-visible:bg-white"
            disabled={isProcessing}
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full shrink-0 bg-emerald-600 hover:bg-emerald-700 h-12 w-12"
            disabled={!input.trim() || isProcessing}
          >
            <Send className="w-5 h-5 ml-1" />
          </Button>
        </form>
      </div>
    </div>
  );
}
