import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { format, isSameDay, isSameWeek, isSameMonth, isSameYear, subDays, subWeeks, subMonths, subYears } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { motion } from "framer-motion";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, TrendingUp, Wallet, BarChart3, Download, RefreshCw } from "lucide-react";
import AddTransactionModal from "../components/AddTransactionModal";
import EditTransactionModal from "../components/EditTransactionModal";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { cn } from "../lib/utils";

interface Transaction {
  id: string;
  type: "sale" | "expense";
  amount: number;
  category: string;
  description: string;
  created_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportTimeframe, setReportTimeframe] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Load transactions
  const loadTransactions = useCallback(async () => {
    if (!user) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      showToast("Failed to load transactions.", "error");
      console.error(error.message);
    } else setTransactions(data as Transaction[] ?? []);
    setLoading(false);
  }, [user, showToast]);

  // Real-time updates
  useEffect(() => {
    if (!user) return;
    loadTransactions();
    const channel = supabase
      .channel(`transactions:user_id=eq.${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") setTransactions(prev => [payload.new as Transaction, ...prev]);
          if (payload.eventType === "UPDATE") setTransactions(prev => prev.map(t => t.id === (payload.new as Transaction).id ? payload.new as Transaction : t));
          if (payload.eventType === "DELETE") setTransactions(prev => prev.filter(t => t.id !== (payload.old as { id: string }).id));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, loadTransactions]);

  const today = new Date();

  // Filtered transactions
  const todayTransactions = useMemo(() => transactions.filter(t => isSameDay(new Date(t.created_at), today)), [transactions, today]);
  const reportTransactions = useMemo(() => transactions.filter(t => {
    const tDate = new Date(t.created_at);
    if (reportTimeframe === "daily") return isSameDay(tDate, today);
    if (reportTimeframe === "weekly") return isSameWeek(tDate, today, { weekStartsOn: 1 });
    if (reportTimeframe === "monthly") return isSameMonth(tDate, today);
    if (reportTimeframe === "yearly") return isSameYear(tDate, today);
    return false;
  }), [transactions, reportTimeframe, today]);

  const previousReportTransactions = useMemo(() => transactions.filter(t => {
    const tDate = new Date(t.created_at);
    if (reportTimeframe === "daily") return isSameDay(tDate, subDays(today, 1));
    if (reportTimeframe === "weekly") return isSameWeek(tDate, subWeeks(today, 1), { weekStartsOn: 1 });
    if (reportTimeframe === "monthly") return isSameMonth(tDate, subMonths(today, 1));
    if (reportTimeframe === "yearly") return isSameYear(tDate, subYears(today, 1));
    return false;
  }), [transactions, reportTimeframe, today]);

  // Calculations
  const calcTotals = (txs: Transaction[]) => ({
    sales: txs.filter(t => t.type === "sale").reduce((sum, t) => sum + t.amount, 0),
    expenses: txs.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0)
  });

  const todayTotals = calcTotals(todayTransactions);
  const reportTotals = calcTotals(reportTransactions);
  const previousTotals = calcTotals(previousReportTransactions);

  const todayProfit = todayTotals.sales - todayTotals.expenses;
  const reportProfit = reportTotals.sales - reportTotals.expenses;
  const previousProfit = previousTotals.sales - previousTotals.expenses;

  // Category breakdown
  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    reportTransactions.forEach(t => categories[t.category] = (categories[t.category] || 0) + t.amount);
    return Object.entries(categories).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [reportTransactions]);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  // CSV export
  const handleExportCSV = () => {
    const headers = ["Date", "Type", "Category", "Description", "Amount"];
    const rows = reportTransactions.map(t => [
      `"${format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}"`,
      `"${t.type}"`,
      `"${t.category}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount
    ]);
    rows.push([], ["Summary", reportTimeframe.toUpperCase()], ["Total Sales", reportTotals.sales], ["Total Expenses", reportTotals.expenses], ["Total Profit", reportProfit]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `biashara_report_${reportTimeframe}_${format(new Date(), 'yyyyMMdd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Chart data for comparison mode
  const chartData = useMemo(() => {
    if (!isComparisonMode) {
      return reportTransactions.map(t => ({ name: format(new Date(t.created_at), 'dd MMM'), profit: t.type === "sale" ? t.amount : -t.amount }));
    } else {
      const mapData: Record<string, { current: number; previous: number }> = {};
      reportTransactions.forEach(t => {
        const key = format(new Date(t.created_at), 'dd MMM');
        mapData[key] = mapData[key] || { current: 0, previous: 0 };
        mapData[key].current += t.type === "sale" ? t.amount : -t.amount;
      });
      previousReportTransactions.forEach(t => {
        const key = format(new Date(t.created_at), 'dd MMM');
        mapData[key] = mapData[key] || { current: 0, previous: 0 };
        mapData[key].previous += t.type === "sale" ? t.amount : -t.amount;
      });
      return Object.entries(mapData).map(([name, value]) => ({ name, ...value }));
    }
  }, [reportTransactions, previousReportTransactions, isComparisonMode]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="space-x-2">
          <Button onClick={handleExportCSV}><Download className="mr-2 w-4 h-4" /> Export CSV</Button>
          <Button onClick={loadTransactions}><RefreshCw className="mr-2 w-4 h-4" /> Refresh</Button>
          <Button onClick={() => setIsComparisonMode(prev => !prev)} className="bg-indigo-600 hover:bg-indigo-700 text-white">{isComparisonMode ? "Normal Mode" : "Comparison Mode"}</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Today's Sales</CardTitle></CardHeader>
          <CardContent className="flex items-center space-x-2">
            <Wallet className="w-6 h-6 text-green-500" />
            <div className="text-lg font-semibold">${todayTotals.sales.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Today's Expenses</CardTitle></CardHeader>
          <CardContent className="flex items-center space-x-2">
            <ArrowDownRight className="w-6 h-6 text-red-500" />
            <div className="text-lg font-semibold">${todayTotals.expenses.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Today's Profit</CardTitle></CardHeader>
          <CardContent className="flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 text-blue-500" />
            <div className="text-lg font-semibold">${todayProfit.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
          <CardContent className="flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-purple-500" />
            <div className="text-lg font-semibold">{transactions.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Profit Chart</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                {!isComparisonMode && <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} />}
                {isComparisonMode && <>
                  <Line type="monotone" dataKey="current" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="previous" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" />
                </>}
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div>Loading...</div>
          ) : transactions.slice(0, 10).map(tx => (
            <motion.div key={tx.id} className="flex justify-between p-2 border rounded cursor-pointer" whileHover={{ scale: 1.02 }} onClick={() => setSelectedTransaction(tx)}>
              <div>
                <div className="font-semibold">{tx.category}</div>
                <div className="text-sm text-gray-500">{tx.description}</div>
              </div>
              <div className={cn("font-semibold", tx.type === "sale" ? "text-green-500" : "text-red-500")}>
                {tx.type === "sale" ? `+ $${tx.amount.toFixed(2)}` : `- $${tx.amount.toFixed(2)}`}
              </div>
            </motion.div>
          ))}
        </CardContent>
      </Card>

      {/* Modals */}
      <AddTransactionModal onAdd={loadTransactions} />
      {selectedTransaction && <EditTransactionModal transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} onUpdate={loadTransactions} />}
    </div>
  );
}
