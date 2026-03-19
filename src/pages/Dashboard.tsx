import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ArrowDownRight, ArrowUpRight, TrendingUp, Wallet, BarChart3, Download, RefreshCw, Cloud } from "lucide-react";
import { supabase } from "../lib/supabase";
import { 
  format, 
  isSameDay, 
  isSameWeek, 
  isSameMonth, 
  isSameYear, 
  startOfDay,
  subDays, 
  subWeeks, 
  subMonths, 
  subYears, 
  startOfWeek, 
  startOfMonth, 
  startOfYear,
  eachHourOfInterval,
  startOfHour,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval
} from 'date-fns';
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import AddTransactionModal from "../components/AddTransactionModal";
import EditTransactionModal from "../components/EditTransactionModal";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line,
  ComposedChart,
  ReferenceLine,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from "motion/react";

import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

interface Transaction {
  id: string;
  type: 'sale' | 'expense';
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
  const [reportTimeframe, setReportTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  /**
   * Fetches the latest 500 transactions for the current user, ordered
   * by creation date descending. Called on mount and can be triggered
   * manually via the refresh button.
   */
  const loadTransactions = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, amount, category, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      showToast("Failed to load transactions. Please check your connection.", "error");
      console.error("Failed to fetch transactions:", error.message);
    } else {
      setTransactions((data as Transaction[]) ?? []);
    }

    setLoading(false);
  }, [user, showToast]);

  /**
   * Initial fetch + real-time subscription.
   *
   * Supabase Realtime fires INSERT / UPDATE / DELETE events so the local
   * state is kept in sync without polling:
   *   INSERT  → prepend new row (maintains desc order)
   *   UPDATE  → replace the matching row in-place
   *   DELETE  → remove the matching row
   *
   * The channel is cleaned up when the component unmounts or the user changes.
   */
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    loadTransactions();

    const channel = supabase
      .channel(`transactions:user_id=eq.${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",                    // INSERT | UPDATE | DELETE
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setTransactions((prev) => [payload.new as Transaction, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setTransactions((prev) =>
              prev.map((t) =>
                t.id === (payload.new as Transaction).id
                  ? (payload.new as Transaction)
                  : t
              )
            );
          } else if (payload.eventType === "DELETE") {
            setTransactions((prev) =>
              prev.filter((t) => t.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadTransactions]);

  const today = new Date();
  
  // Stats for the top cards (always today)
  const todayTransactions = transactions.filter(t => isSameDay(new Date(t.created_at), today));
  const todaySales = todayTransactions.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.amount, 0);
  const todayExpenses = todayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const todayProfit = todaySales - todayExpenses;

  // Stats for the reports section
  const reportTransactions = transactions.filter(t => {
    const tDate = new Date(t.created_at);
    if (reportTimeframe === 'daily') return isSameDay(tDate, today);
    if (reportTimeframe === 'weekly') return isSameWeek(tDate, today, { weekStartsOn: 1 });
    if (reportTimeframe === 'monthly') return isSameMonth(tDate, today);
    if (reportTimeframe === 'yearly') return isSameYear(tDate, today);
    return false;
  });

  const reportSales = reportTransactions.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.amount, 0);
  const reportExpenses = reportTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const reportProfit = reportSales - reportExpenses;

  const previousReportTransactions = transactions.filter(t => {
    const tDate = new Date(t.created_at);
    if (reportTimeframe === 'daily') return isSameDay(tDate, subDays(today, 1));
    if (reportTimeframe === 'weekly') return isSameWeek(tDate, subWeeks(today, 1), { weekStartsOn: 1 });
    if (reportTimeframe === 'monthly') return isSameMonth(tDate, subMonths(today, 1));
    if (reportTimeframe === 'yearly') return isSameYear(tDate, subYears(today, 1));
    return false;
  });

  const previousReportSales = previousReportTransactions.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.amount, 0);
  const previousReportExpenses = previousReportTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const previousReportProfit = previousReportSales - previousReportExpenses;

  const chartData = (() => {
    if (!isComparisonMode) {
      let interval: { start: Date; end: Date };
      let formatStr: string;
      let checkFn: (d1: Date, d2: Date) => boolean;

      if (reportTimeframe === 'daily') {
        interval = { start: subDays(today, 6), end: today };
        formatStr = 'EEE';
        checkFn = isSameDay;
      } else if (reportTimeframe === 'weekly') {
        interval = { start: subWeeks(today, 3), end: today };
        formatStr = "'W'w";
        checkFn = (d1, d2) => isSameWeek(d1, d2, { weekStartsOn: 1 });
      } else if (reportTimeframe === 'monthly') {
        interval = { start: subMonths(today, 5), end: today };
        formatStr = 'MMM';
        checkFn = isSameMonth;
      } else {
        interval = { start: subYears(today, 2), end: today };
        formatStr = 'yyyy';
        checkFn = isSameYear;
      }

      const periods = reportTimeframe === 'daily' ? eachDayOfInterval(interval) :
                     reportTimeframe === 'weekly' ? eachWeekOfInterval(interval, { weekStartsOn: 1 }) :
                     reportTimeframe === 'monthly' ? eachMonthOfInterval(interval) :
                     eachYearOfInterval(interval);

      let cumulativeProfit = 0;
      return periods.map(p => {
        const pTx = transactions.filter(t => checkFn(new Date(t.created_at), p));
        const sales = pTx.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.amount, 0);
        const expenses = pTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const profit = sales - expenses;
        cumulativeProfit += profit;
        return {
          name: format(p, formatStr),
          sales,
          expenses,
          profit,
          cumulativeProfit,
          margin: sales > 0 ? (profit / sales) * 100 : 0
        };
      });
    } else {
      // Comparison logic
      let currentPeriods: Date[];
      let prevPeriods: Date[];
      let formatStr: string;
      let checkFn: (d1: Date, d2: Date) => boolean;

      if (reportTimeframe === 'daily') {
        const currentStart = startOfDay(today);
        const prevStart = startOfDay(subDays(today, 1));
        currentPeriods = eachHourOfInterval({ start: currentStart, end: today });
        prevPeriods = eachHourOfInterval({ start: prevStart, end: subDays(today, 1) });
        formatStr = 'HH:mm';
        checkFn = (d1, d2) => startOfHour(d1).getHours() === startOfHour(d2).getHours();
      } else if (reportTimeframe === 'weekly') {
        const currentStart = startOfWeek(today, { weekStartsOn: 1 });
        const prevStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        currentPeriods = eachDayOfInterval({ start: currentStart, end: today });
        prevPeriods = eachDayOfInterval({ start: prevStart, end: subWeeks(today, 1) });
        formatStr = 'EEE';
        checkFn = (d1, d2) => d1.getDay() === d2.getDay();
      } else if (reportTimeframe === 'monthly') {
        const currentStart = startOfMonth(today);
        const prevStart = startOfMonth(subMonths(today, 1));
        currentPeriods = eachDayOfInterval({ start: currentStart, end: today });
        prevPeriods = eachDayOfInterval({ start: prevStart, end: subMonths(today, 1) });
        formatStr = 'd';
        checkFn = (d1, d2) => d1.getDate() === d2.getDate();
      } else {
        const currentStart = startOfYear(today);
        const prevStart = startOfYear(subYears(today, 1));
        currentPeriods = eachMonthOfInterval({ start: currentStart, end: today });
        prevPeriods = eachMonthOfInterval({ start: prevStart, end: subYears(today, 1) });
        formatStr = 'MMM';
        checkFn = (d1, d2) => d1.getMonth() === d2.getMonth();
      }

      let cumulativeProfit = 0;
      let prevCumulativeProfit = 0;
      
      return currentPeriods.map((p, i) => {
        const pTx = transactions.filter(t => checkFn(new Date(t.created_at), p) && new Date(t.created_at) >= currentPeriods[0]);
        const sales = pTx.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.amount, 0);
        const expenses = pTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const profit = sales - expenses;
        cumulativeProfit += profit;

        const prevP = prevPeriods[i];
        let prevSales = 0, prevExpenses = 0, prevProfit = 0;
        if (prevP) {
          const prevPTx = transactions.filter(t => checkFn(new Date(t.created_at), prevP) && new Date(t.created_at) < currentPeriods[0]);
          prevSales = prevPTx.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.amount, 0);
          prevExpenses = prevPTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
          prevProfit = prevSales - prevExpenses;
          prevCumulativeProfit += prevProfit;
        }

        return {
          name: format(p, formatStr),
          sales,
          expenses,
          profit,
          cumulativeProfit,
          prevSales,
          prevExpenses,
          prevProfit,
          prevCumulativeProfit,
          margin: sales > 0 ? (profit / sales) * 100 : 0,
          prevMargin: prevSales > 0 ? (prevProfit / prevSales) * 100 : 0
        };
      });
    }
  })();

  const categoryData = (() => {
    const categories: { [key: string]: number } = {};
    reportTransactions.forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  })();

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  const handleExportCSV = () => {
    const headers = ["Date", "Type", "Category", "Description", "Amount"];
    const rows = reportTransactions.map(t => [
      `"${format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}"`,
      `"${t.type}"`,
      `"${t.category}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount
    ]);

    // Add summary rows
    rows.push([]);
    rows.push(["Summary", reportTimeframe.toUpperCase()]);
    rows.push(["Total Sales", reportSales]);
    rows.push(["Total Expenses", reportExpenses]);
    rows.push(["Total Profit", reportProfit]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `biashara_report_${reportTimeframe}_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-md mx-auto w-full">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-500">{format(today, 'EEEE, d MMM yyyy')}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter bg-emerald-100 text-emerald-600 flex items-center gap-1">
              <Cloud className="w-2.5 h-2.5" />
              Syncing
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddTransactionModal onSuccess={loadTransactions} />
          <button 
            onClick={loadTransactions}
            className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold overflow-hidden">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="Me" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              // Supabase stores display name under user_metadata.full_name or user_metadata.name
              (user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'Me').slice(0, 2)
            )}
          </div>
        </div>
      </header>

      <div className="bg-emerald-600 text-white rounded-3xl p-6 shadow-lg shadow-emerald-600/20">
        <p className="text-emerald-100 text-sm font-medium mb-1">Today's Profit</p>
        <h2 className="text-4xl font-bold tracking-tight">KES {todayProfit.toLocaleString()}</h2>
        <div className="mt-6 flex items-center gap-2 text-sm text-emerald-50 bg-emerald-700/50 w-fit px-3 py-1.5 rounded-full">
          <TrendingUp className="w-4 h-4" />
          <span>You made KES {todayProfit.toLocaleString()} profit today</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-4">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <p className="text-sm text-slate-500 font-medium">Sales</p>
            <p className="text-xl font-bold text-slate-900">KES {todaySales.toLocaleString()}</p>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-4">
            <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
              <ArrowDownRight className="w-4 h-4" />
            </div>
            <p className="text-sm text-slate-500 font-medium">Expenses</p>
            <p className="text-xl font-bold text-slate-900">KES {todayExpenses.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reports Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            Financial Reports
          </h3>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 gap-1.5"
            onClick={handleExportCSV}
            disabled={reportTransactions.length === 0}
          >
            <Download className="w-4 h-4" />
            <span className="text-xs font-bold">Export</span>
          </Button>
        </div>

        <div className="flex p-1 bg-slate-200/50 rounded-xl w-full">
          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setReportTimeframe(t)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize",
                reportTimeframe === t 
                  ? "bg-white text-emerald-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-medium text-slate-500">
            {isComparisonMode ? "Comparing with previous period" : "Showing current period trends"}
          </p>
          <button
            onClick={() => setIsComparisonMode(!isComparisonMode)}
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-all border",
              isComparisonMode 
                ? "bg-emerald-600 text-white border-emerald-600" 
                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-600 hover:text-emerald-600"
            )}
          >
            {isComparisonMode ? "Disable Comparison" : "Enable Comparison"}
          </button>
        </div>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Trends Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(value) => `K${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }} />
                  <Area type="monotone" dataKey="sales" stroke="#10b981" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} name={isComparisonMode ? "Current Sales" : "Sales"} />
                  {isComparisonMode && <Area type="monotone" dataKey="prevSales" stroke="#94a3b8" fillOpacity={0.05} fill="#94a3b8" strokeWidth={1} strokeDasharray="5 5" name="Previous Sales" />}
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpenses)" strokeWidth={2} name={isComparisonMode ? "Current Expenses" : "Expenses"} />
                  {isComparisonMode && <Area type="monotone" dataKey="prevExpenses" stroke="#fca5a5" fillOpacity={0.05} fill="#fca5a5" strokeWidth={1} strokeDasharray="5 5" name="Previous Expenses" />}
                  <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} name={isComparisonMode ? "Current Profit" : "Profit/Loss"} />
                  {isComparisonMode && <Line type="monotone" dataKey="prevProfit" stroke="#93c5fd" strokeWidth={1} strokeDasharray="3 3" dot={{ r: 2, fill: '#93c5fd' }} name="Previous Profit" />}
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Profit & Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(value) => `K${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="profit" name={isComparisonMode ? "Current Profit" : "Profit/Loss"} radius={[4, 4, 0, 0]} barSize={reportTimeframe === 'daily' ? 12 : 20}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                  {isComparisonMode && <Bar dataKey="prevProfit" name="Previous Profit" radius={[4, 4, 0, 0]} barSize={reportTimeframe === 'daily' ? 12 : 20} fill="#94a3b8" opacity={0.5} />}
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full flex flex-col items-center">
              <ResponsiveContainer width="100%" height="70%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `KES ${value.toLocaleString()}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full mt-4">
                {categoryData.slice(0, 6).map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[10px] font-medium text-slate-600 truncate capitalize">{entry.name}</span>
                    <span className="text-[10px] font-bold text-slate-900 ml-auto">
                      {((entry.value / (reportSales + reportExpenses || 1)) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Performance Overview</CardTitle>
          </CardHeader>
          <div className="p-6 pt-0 space-y-6">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(value) => `K${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#3b82f6' }} tickFormatter={(value) => `${value}%`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} cursor={{ fill: '#f8fafc' }} />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }} />
                  <Bar yAxisId="left" dataKey="sales" fill="#10b981" name={isComparisonMode ? "Current Sales" : "Sales"} radius={[4, 4, 0, 0]} barSize={reportTimeframe === 'daily' ? 12 : 20} />
                  {isComparisonMode && <Bar yAxisId="left" dataKey="prevSales" fill="#94a3b8" name="Prev. Sales" radius={[4, 4, 0, 0]} barSize={reportTimeframe === 'daily' ? 12 : 20} opacity={0.5} />}
                  <Bar yAxisId="left" dataKey="expenses" fill="#ef4444" name={isComparisonMode ? "Current Expenses" : "Expenses"} radius={[4, 4, 0, 0]} barSize={reportTimeframe === 'daily' ? 12 : 20} />
                  {isComparisonMode && <Bar yAxisId="left" dataKey="prevExpenses" fill="#fca5a5" name="Prev. Expenses" radius={[4, 4, 0, 0]} barSize={reportTimeframe === 'daily' ? 12 : 20} opacity={0.5} />}
                  <Line yAxisId="right" type="monotone" dataKey="margin" stroke="#3b82f6" name={isComparisonMode ? "Current Margin %" : "Net Margin %"} strokeWidth={2} dot={{ r: 3 }} />
                  {isComparisonMode && <Line yAxisId="right" type="monotone" dataKey="prevMargin" stroke="#93c5fd" name="Prev. Margin %" strokeWidth={1} strokeDasharray="3 3" dot={{ r: 2 }} />}
                  <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Profit</p>
                <h4 className={cn("text-2xl font-bold", reportProfit >= 0 ? "text-emerald-600" : "text-red-600")}>
                  KES {reportProfit.toLocaleString()}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", reportProfit >= previousReportProfit ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>
                    {reportProfit >= previousReportProfit ? '+' : ''}
                    {previousReportProfit !== 0 ? ((reportProfit - previousReportProfit) / Math.abs(previousReportProfit) * 100).toFixed(0) : '100'}%
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">vs prev. {reportTimeframe}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                  {reportTimeframe === 'daily' ? format(today, 'MMM d') : 
                   reportTimeframe === 'weekly' ? 'This Week' : 
                   reportTimeframe === 'monthly' ? 'This Month' : 'This Year'}
                </p>
                {reportSales > 0 && (
                  <p className="text-[10px] font-medium text-slate-400 mt-1">
                    Net Margin: <span className={reportProfit >= 0 ? "text-emerald-500" : "text-red-500"}>
                      {((reportProfit / reportSales) * 100).toFixed(1)}%
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-600">Total Sales</span>
                    <p className="text-[10px] text-slate-400">Prev: KES {previousReportSales.toLocaleString()}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900">KES {reportSales.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-100 text-red-600 rounded-lg flex items-center justify-center">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-600">Total Expenses</span>
                    <p className="text-[10px] text-slate-400">Prev: KES {previousReportExpenses.toLocaleString()}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900">KES {reportExpenses.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Cumulative Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(value) => `K${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="cumulativeProfit" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCumulative)" strokeWidth={2} name={isComparisonMode ? "Current Cumulative" : "Cumulative Profit"} />
                  {isComparisonMode && <Area type="monotone" dataKey="prevCumulativeProfit" stroke="#94a3b8" fillOpacity={0.1} fill="#94a3b8" strokeWidth={1} strokeDasharray="5 5" name="Previous Cumulative" />}
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Transactions</h3>
        {loading ? (
          <p className="text-slate-500 text-center py-8">Loading...</p>
        ) : transactions.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200"
          >
            <Wallet className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No transactions yet.</p>
            <p className="text-sm text-slate-400 mt-1">Tap the + button to add one.</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {transactions.map((t) => (
                <motion.button 
                  key={t.id} 
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ scale: 1.01, borderColor: '#10b981' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedTransaction(t)}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      t.type === 'sale' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                    )}>
                      {t.type === 'sale' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-slate-900">{t.description}</p>
                      <p className="text-xs text-slate-500 capitalize">{t.category} • {format(new Date(t.created_at), 'h:mm a')}</p>
                    </div>
                  </div>
                  <p className={cn("font-bold", t.type === 'sale' ? "text-emerald-600" : "text-slate-900")}>
                    {t.type === 'sale' ? '+' : '-'} {t.amount.toLocaleString()}
                  </p>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {selectedTransaction && (
        <EditTransactionModal 
          transaction={selectedTransaction} 
          onClose={() => setSelectedTransaction(null)} 
          onSuccess={loadTransactions} 
        />
      )}
    </div>
  );
}
