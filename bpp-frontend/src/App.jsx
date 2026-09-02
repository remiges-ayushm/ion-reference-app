import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ShoppingBag, Package, Radio, MessageSquare,
  ChevronRight, TrendingUp, Clock, CheckCircle2, AlertCircle,
  RefreshCw, X, ChevronLeft, ChevronRight as ChevronRightIcon,
  Upload, Plus, Trash2, Eye, ArrowUpRight, Filter, Search,
  Activity, Zap, Store, Calendar, Tag, BarChart2, Inbox,
  ArrowRight, Circle, Star, Ticket, Ban, Wand2,
  BookOpen, FolderOpen, Send, ArrowLeft,
} from 'lucide-react'

const API_BASE = '/api/v1'
const BRAND    = 'linear-gradient(135deg,#00b8e6 0%,#1e2fa0 100%)'
const BRAND2   = 'linear-gradient(135deg,#e6006e 0%,#7c3aed 100%)'

// ─── helpers ────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' }, ...opts,
  })
  if (!res.ok) { const b = await res.text(); throw new Error(b || res.statusText) }
  return res.json()
}

function useApi(path, deps = []) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const load = useCallback(async () => {
    if (!path) return
    setLoading(true); setError(null)
    try { setData(await apiFetch(path)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [path, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

const fmtDate = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

const fmtDateShort = ts => {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtName(obj) {
  if (!obj) return '—'
  if (typeof obj === 'string') { try { obj = JSON.parse(obj) } catch { return obj } }
  return obj?.name || obj?.code || obj?.descriptor?.name || '—'
}

// ─── base components ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    ACTIVE:    { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400' },
    DRAFT:     { cls: 'bg-amber-500/15  text-amber-400  border-amber-500/25',    dot: 'bg-amber-400' },
    CANCELLED: { cls: 'bg-red-500/15    text-red-400    border-red-500/25',      dot: 'bg-red-400' },
    COMPLETE:  { cls: 'bg-sky-500/15    text-sky-400    border-sky-500/25',      dot: 'bg-sky-400' },
    ACK:       { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400' },
    NACK:      { cls: 'bg-red-500/15    text-red-400    border-red-500/25',      dot: 'bg-red-400' },
  }
  const s = map[status] || { cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25', dot: 'bg-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status || '—'}
    </span>
  )
}

function Card({ children, className = '', style }) {
  return (
    <div className={`bg-[#111827] border border-white/[0.07] rounded-2xl ${className}`} style={style}>
      {children}
    </div>
  )
}

function LoadingSpinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-cyan-400 animate-spin" />
      {label && <p className="text-xs text-slate-500">{label}</p>}
    </div>
  )
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
      <AlertCircle size={16} className="shrink-0" />
      <span className="flex-1 text-xs">{message}</span>
      {onRetry && <button onClick={onRetry} className="text-xs font-semibold underline underline-offset-2 shrink-0">Retry</button>}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">{children}</p>
  )
}

function Pagination({ page, totalPages, onPage, total, limit }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
      <span className="text-xs text-slate-500">{total} total · page {page}/{totalPages}</span>
      <div className="flex gap-1.5">
        <button disabled={page <= 1} onClick={() => onPage(p => p - 1)}
          className="p-1.5 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <button disabled={page >= totalPages} onClick={() => onPage(p => p + 1)}
          className="p-1.5 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'overview',  label: 'Overview',        icon: LayoutDashboard, desc: 'Stats & insights' },
  { id: 'orders',    label: 'Orders',           icon: ShoppingBag,     desc: 'Manage contracts' },
  { id: 'inventory', label: 'Inventory',        icon: Package,         desc: 'Resources & offers' },
  { id: 'catalogs',  label: 'Catalogs',         icon: BookOpen,        desc: 'Manage & publish' },
  { id: 'messages',  label: 'Message Log',      icon: MessageSquare,   desc: 'Protocol audit' },
  { id: 'support',   label: 'Support Tickets',  icon: Ticket,          desc: 'Customer support' },
  { id: 'ratings',   label: 'Ratings',          icon: Star,            desc: 'Order ratings' },
]

function Sidebar({ active, onNav, open, onClose }) {
  const navContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-white tracking-tight">
            ION <span className="font-normal text-slate-400">Reference App</span>
          </span>
          <div className="mt-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[10px] text-slate-500 font-medium">BPP Admin · ION Network</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon, desc }) => {
          const isActive = active === id || (id === 'catalogs' && ['catalog_detail','create_catalog','add_product'].includes(active))
          return (
            <button key={id} onClick={() => { onNav(id); onClose?.() }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              style={isActive ? { background: 'rgba(0,184,230,0.12)', border: '1px solid rgba(0,184,230,0.25)' } : {}}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                isActive ? '' : 'bg-slate-900 group-hover:bg-white/[0.07]'
              }`}
                style={isActive ? { background: 'rgba(0,184,230,0.2)' } : {}}>
                <Icon size={15} style={isActive ? { color: '#00b8e6' } : {}} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm leading-none">{label}</p>
                <p className={`text-[10px] mt-0.5 truncate ${isActive ? 'text-cyan-400/60' : 'text-slate-600'}`}>{desc}</p>
              </div>
              {isActive && <ChevronRight size={13} style={{ color: '#00b8e6', flexShrink: 0 }} />}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-slate-600">Beckn Protocol v2.0 · ION Retail</p>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col w-64 border-r border-white/[0.06]"
        style={{ background: '#0a0e1a' }}>
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
          <aside className="fixed inset-y-0 left-0 z-50 flex flex-col w-72 border-r border-white/[0.06] lg:hidden"
            style={{ background: '#0a0e1a' }}>
            {navContent}
          </aside>
        </>
      )}
    </>
  )
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

function PageHeader({ title, subtitle, action, breadcrumb }) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        {breadcrumb && <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#00b8e6' }}>{breadcrumb}</p>}
        <h1 className="text-2xl font-bold text-white leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Overview ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, gradient, sub, onClick, loading }) {
  const Wrap = onClick ? 'button' : 'div'
  return (
    <Wrap onClick={onClick}
      className={`relative w-full text-left rounded-2xl p-5 border border-white/[0.07] overflow-hidden transition-all
        ${onClick ? 'cursor-pointer hover:border-white/[0.14] hover:shadow-lg active:scale-[0.98]' : ''}`}
      style={{ background: '#111827' }}
    >
      {/* Glow blob */}
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10 blur-xl"
        style={{ background: gradient }} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="text-4xl font-bold text-white mt-1.5 leading-none">
            {loading ? <span className="inline-block w-12 h-8 rounded bg-slate-700/60 animate-pulse" /> : (value ?? '—')}
          </p>
          {sub && <p className="text-xs text-slate-500 mt-2">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: gradient + '33' }}>
          <Icon size={18} style={{ color: 'white', opacity: 0.9 }} />
        </div>
      </div>
      {onClick && (
        <div className="relative mt-4 flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: '#00b8e6' }}>
          View details <ArrowRight size={11} />
        </div>
      )}
    </Wrap>
  )
}

function FunnelCard({ funnel, loading }) {
  const steps = [
    { key: 'select',  label: 'Select',  color: '#00b8e6', emoji: '🔍' },
    { key: 'init',    label: 'Init',    color: '#7c3aed', emoji: '📋' },
    { key: 'confirm', label: 'Confirm', color: '#10b981', emoji: '✅' },
  ]
  const max = Math.max(1, ...steps.map(s => funnel?.[s.key] ?? 0))
  const selectCount = funnel?.select ?? 0
  const confirmCount = funnel?.confirm ?? 0
  const convRate = selectCount > 0 ? Math.round((confirmCount / selectCount) * 100) : 0

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Conversion Funnel</SectionTitle>
        {!loading && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
            {convRate}% conversion
          </span>
        )}
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-4">
          {steps.map(({ key, label, color, emoji }, idx) => {
            const val = funnel?.[key] ?? 0
            const pct = (val / max) * 100
            const drop = idx > 0 ? steps[idx - 1].key : null
            const dropVal = drop ? (funnel?.[drop] ?? 0) : null
            const dropPct = dropVal > 0 ? Math.round(((dropVal - val) / dropVal) * 100) : null
            return (
              <div key={key}>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    {emoji} {label}
                  </span>
                  <div className="flex items-center gap-2">
                    {dropPct !== null && dropPct > 0 && (
                      <span className="text-red-400 text-[10px]">−{dropPct}%</span>
                    )}
                    <span className="font-bold text-white">{val}</span>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: idx * 0.1 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function ActivityRow({ o, onView }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.05] last:border-0 group">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
        style={{ background: 'rgba(0,184,230,0.1)' }}>
        {o.status === 'ACTIVE' ? '✅' : o.status === 'DRAFT' ? '⏳' : o.status === 'CANCELLED' ? '❌' : '📦'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{o.bap_id}</p>
        <p className="text-[11px] text-slate-500 font-mono">{o.transaction_id?.slice(0, 12)}…</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={o.status} />
        <p className="text-[10px] text-slate-600">{fmtDateShort(o.created_at?.Time || o.created_at)}</p>
      </div>
      <button onClick={() => onView(o)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-cyan-400">
        <Eye size={14} />
      </button>
    </div>
  )
}

function OverviewPage({ onNav }) {
  const { data: stats, loading: sLoad, error: sErr, reload } = useApi('/dashboard/stats')
  const { data: orders } = useApi('/orders?limit=6')
  const { data: supportData } = useApi('/support-tickets?page=1&limit=1')
  const { data: ratingsData  } = useApi('/ratings?page=1&limit=1')
  const totalTickets = supportData?.total ?? null
  const totalRatings = ratingsData?.total  ?? null

  return (
    <div>
      <PageHeader
        breadcrumb="BPP Admin · Dashboard"
        title="Overview"
        subtitle="Live snapshot of your seller activity on the ION network"
        action={
          <button onClick={reload}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/[0.07] hover:border-white/20">
            <RefreshCw size={12} className={sLoad ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {sErr && <div className="mb-4"><ErrorBox message={sErr} onRetry={reload} /></div>}

      {/* Stock alerts */}
      {!sLoad && (stats?.out_of_stock > 0 || stats?.low_stock > 0) && (
        <div className="mb-5 flex flex-wrap gap-3">
          {stats?.out_of_stock > 0 && (
            <button onClick={() => onNav('inventory', { initialTab: 'stock' })}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-90"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
              <AlertCircle size={14} />
              {stats.out_of_stock} resource{stats.out_of_stock !== 1 ? 's' : ''} out of stock — view stock
            </button>
          )}
          {stats?.low_stock > 0 && (
            <button onClick={() => onNav('inventory', { initialTab: 'stock' })}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-90"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
              <AlertCircle size={14} />
              {stats.low_stock} resource{stats.low_stock !== 1 ? 's' : ''} running low — view stock
            </button>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard label="Active Orders"  value={stats?.active_orders}  icon={CheckCircle2} gradient="linear-gradient(135deg,#10b981,#059669)" loading={sLoad} onClick={() => onNav('orders')} />
        <StatCard label="Pending Orders" value={stats?.pending_orders} icon={Clock}        gradient="linear-gradient(135deg,#f59e0b,#d97706)" loading={sLoad} onClick={() => onNav('orders')} />
        <StatCard label="Orders Today"   value={stats?.today_orders}   icon={TrendingUp}   gradient="linear-gradient(135deg,#00b8e6,#1e2fa0)" loading={sLoad} onClick={() => onNav('orders')} />
        <StatCard label="Resources"      value={stats?.resource_count} icon={Package}      gradient="linear-gradient(135deg,#06b6d4,#0891b2)" loading={sLoad} onClick={() => onNav('inventory', { initialTab: 'resources' })} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Offers"  value={stats?.offer_count}    icon={Tag}          gradient="linear-gradient(135deg,#e6006e,#7c3aed)" loading={sLoad} onClick={() => onNav('inventory', { initialTab: 'offers' })} />
        <StatCard label="Out of Stock"   value={stats?.out_of_stock ?? 0} icon={Ban}       gradient="linear-gradient(135deg,#ef4444,#b91c1c)" loading={sLoad} onClick={() => onNav('inventory', { initialTab: 'stock' })} />
        <StatCard label="Support Tickets" value={totalTickets}         icon={Ticket}       gradient="linear-gradient(135deg,#8b5cf6,#6d28d9)" loading={totalTickets === null} onClick={() => onNav('support')} />
        <StatCard label="Ratings"        value={totalRatings}          icon={Star}         gradient="linear-gradient(135deg,#f59e0b,#b45309)" loading={totalRatings === null} onClick={() => onNav('ratings')} />
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent orders */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <p className="text-sm font-bold text-white">Recent Orders</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Latest incoming contracts</p>
              </div>
              <button onClick={() => onNav('orders')}
                className="flex items-center gap-1 text-xs font-semibold transition-colors"
                style={{ color: '#00b8e6' }}>
                View all <ChevronRight size={12} />
              </button>
            </div>
            <div className="px-5 py-1">
              {!orders?.items?.length
                ? <p className="text-sm text-slate-500 py-8 text-center">No orders yet</p>
                : orders.items.map(o => (
                    <ActivityRow key={o.id} o={o} onView={() => onNav('orders')} />
                  ))
              }
            </div>
          </Card>
        </div>

        {/* Funnel */}
        <FunnelCard funnel={stats?.funnel} loading={sLoad} />
      </div>
    </div>
  )
}

// ─── Orders ───────────────────────────────────────────────────────────────────

function OrderDetailDrawer({ order, onClose }) {
  const { data, loading } = useApi(order?.id ? `/orders/${order.id}` : null, [order?.id])
  return (
    <AnimatePresence>
      {order && (
        <>
          <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} />
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 w-[500px] flex flex-col border-l border-white/[0.07]"
            style={{ background: '#0a0e1a' }}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0">
              <div>
                <p className="font-bold text-white">Order Detail</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{order.transaction_id}</p>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.07] transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {loading ? <LoadingSpinner label="Loading contract…" /> : (
                <>
                  {/* Contract info */}
                  <section>
                    <SectionTitle>Contract</SectionTitle>
                    <Card className="divide-y divide-white/[0.05]">
                      {[
                        ['Status',  <StatusBadge key="s" status={data?.contract?.status} />],
                        ['Buyer',   data?.contract?.bap_id],
                        ['Domain',  data?.contract?.domain || '—'],
                        ['Created', fmtDate(data?.contract?.created_at?.Time || data?.contract?.created_at)],
                        ['Updated', fmtDate(data?.contract?.updated_at?.Time || data?.contract?.updated_at)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-slate-500 shrink-0 w-20">{k}</span>
                          <span className="text-slate-200 text-right">{v}</span>
                        </div>
                      ))}
                    </Card>
                  </section>

                  {/* Commitments */}
                  {data?.commitments?.length > 0 && (
                    <section>
                      <SectionTitle>Commitments ({data.commitments.length})</SectionTitle>
                      <div className="space-y-2">
                        {data.commitments.map(cm => (
                          <Card key={cm.id} className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-mono text-slate-400 truncate">{cm.id}</p>
                              <StatusBadge status={cm.status} />
                            </div>
                            {cm.offer_id && (
                              <div className="flex items-center gap-2 text-xs">
                                <Tag size={11} className="text-slate-500" />
                                <span className="text-slate-300">{cm.offer_id}</span>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Considerations */}
                  {data?.considerations?.length > 0 && (
                    <section>
                      <SectionTitle>Consideration</SectionTitle>
                      <div className="space-y-2">
                        {data.considerations.map((c, i) => {
                          let attrs = c.consideration_attributes
                          try { if (typeof attrs === 'string') attrs = JSON.parse(attrs) } catch {}
                          const price    = attrs?.price || attrs?.totalAmount
                          const currency = attrs?.currency || 'INR'
                          return (
                            <Card key={i} className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-slate-300">{c.status_code}</span>
                                {price && (
                                  <span className="text-lg font-bold" style={{ color: '#00b8e6' }}>
                                    {currency === 'INR' ? '₹' : ''}{Number(price).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              {attrs && (
                                <pre className="text-[10px] text-slate-500 bg-black/30 rounded-lg p-2 overflow-x-auto mt-1">
                                  {JSON.stringify(attrs, null, 2)}
                                </pre>
                              )}
                            </Card>
                          )
                        })}
                      </div>
                    </section>
                  )}

                  {/* Ratings */}
                  {data?.contract?.id && <OrderRatings contractId={data.contract.id} />}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function OrdersPage() {
  const [page, setPage]     = useState(1)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const limit = 20
  const { data, loading, error, reload } = useApi(`/orders?page=${page}&limit=${limit}`, [page])
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const items      = (data?.items ?? []).filter(o =>
    !search || o.bap_id?.includes(search) || o.transaction_id?.includes(search) || o.status?.includes(search.toUpperCase())
  )

  return (
    <div>
      <PageHeader breadcrumb="Orders" title="Order Management"
        subtitle={total ? `${total} total contracts on the network` : 'No orders yet'}
        action={
          <button onClick={reload}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/[0.07]">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search buyer, txn ID or status…"
          className="w-full bg-slate-900 border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/40 transition-colors" />
      </div>

      <Card>
        {loading ? <LoadingSpinner label="Loading orders…" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.06]">
                <th className="text-left px-5 py-3">Txn ID</th>
                <th className="text-left px-5 py-3">Buyer</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Offer</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {items.map(o => (
                <tr key={o.id} className="hover:bg-white/[0.025] transition-colors group">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{o.transaction_id?.slice(0, 8)}…</td>
                  <td className="px-5 py-3 text-slate-300 font-medium max-w-[180px] truncate">{o.bap_id}</td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-slate-400 text-xs max-w-[140px] truncate">{fmtName(o.offer_descriptor)}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{fmtDateShort(o.created_at?.Time || o.created_at)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => setSelected(o)}
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs font-semibold transition-all"
                      style={{ color: '#00b8e6' }}>
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No orders found</td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onPage={setPage} total={total} limit={limit} />
      </Card>

      <OrderDetailDrawer order={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

// ─── Inventory ────────────────────────────────────────────────────────────────

function ResourcesTab() {
  const [page, setPage] = useState(1)
  const limit = 20
  const { data, loading, error, reload } = useApi(`/inventory/resources?page=${page}&limit=${limit}`, [page])
  const { data: stockData } = useApi('/inventory/stock')
  const total = data?.total ?? 0

  // Build a quick lookup: resourceId -> stock item
  const stockMap = {}
  for (const s of (stockData?.items ?? [])) stockMap[s.resourceId] = s

  return (
    <div>
      {error && <div className="mb-3"><ErrorBox message={error} onRetry={reload} /></div>}
      <Card className="mt-4">
        {loading ? <LoadingSpinner label="Loading resources…" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.06]">
                <th className="text-left px-5 py-3">Resource ID</th>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-left px-5 py-3">Catalog</th>
                <th className="text-center px-5 py-3">In Stock</th>
                <th className="text-center px-5 py-3">Sold</th>
                <th className="text-left px-5 py-3">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {(data?.items ?? []).map(r => {
                const s = stockMap[r.id]
                return (
                  <tr key={r.id} className="hover:bg-white/[0.025] transition-colors">
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-500 max-w-[140px] truncate" title={r.id}>{r.id}</td>
                    <td className="px-5 py-3 text-slate-200 font-semibold">{r.descriptor_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-[220px] truncate">{r.descriptor_short_desc || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded-full text-slate-400">{r.catalog_id}</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {s
                        ? <StockBadge qty={s.quantity} />
                        : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-center text-xs text-slate-400 font-semibold">
                      {s ? s.sold : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{fmtDateShort(r.created_at?.Time || r.created_at)}</td>
                  </tr>
                )
              })}
              {!data?.items?.length && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No resources published yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / limit))} onPage={setPage} total={total} limit={limit} />
      </Card>
    </div>
  )
}

// Stock badge: green if > 5, yellow if 1-5, red if 0
function StockBadge({ qty }) {
  if (qty === 0) return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
      Out of Stock
    </span>
  )
  if (qty <= 5) return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
      Low: {qty}
    </span>
  )
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
      {qty}
    </span>
  )
}

function StockTab() {
  const { data, loading, error, reload } = useApi('/inventory/stock')
  const items = data?.items ?? []

  const totalStock = items.reduce((s, r) => s + r.quantity, 0)
  const totalSold  = items.reduce((s, r) => s + r.sold, 0)
  const outOfStock = items.filter(r => r.quantity === 0).length

  return (
    <div>
      {error && <div className="mb-3"><ErrorBox message={error} onRetry={reload} /></div>}

      {/* Quick stat bar */}
      <div className="mt-4 grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Total Items', value: items.length, color: '#00b8e6' },
          { label: 'Units In Stock', value: totalStock, color: '#10b981' },
          { label: 'Units Sold', value: totalSold, color: '#e6006e' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4 border border-white/[0.07]" style={{ background: '#111827' }}>
            <p className="text-[11px] uppercase tracking-widest font-semibold text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>{loading ? '…' : value}</p>
          </div>
        ))}
      </div>

      {outOfStock > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          <AlertCircle size={14} />
          {outOfStock} resource{outOfStock !== 1 ? 's are' : ' is'} out of stock
        </div>
      )}

      <Card>
        {loading ? <LoadingSpinner label="Loading stock…" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.06]">
                <th className="text-left px-5 py-3">Resource</th>
                <th className="text-left px-5 py-3">Catalog</th>
                <th className="text-center px-5 py-3">In Stock</th>
                <th className="text-center px-5 py-3">Sold</th>
                <th className="text-left px-5 py-3">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {items.map(r => (
                <tr key={r.resourceId} className="hover:bg-white/[0.025] transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-slate-200 font-semibold text-sm">{r.name}</p>
                    <p className="text-[11px] font-mono text-slate-600 mt-0.5" title={r.resourceId}>{r.resourceId}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[11px] bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded-full text-slate-400">{r.catalogId || '—'}</span>
                  </td>
                  <td className="px-5 py-3 text-center"><StockBadge qty={r.quantity} /></td>
                  <td className="px-5 py-3 text-center text-sm font-bold text-slate-400">{r.sold}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(r.updatedAt)}</td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                  No stock data yet — publish a catalog with stock quantities to start tracking
                </td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function OffersTab() {
  const [page, setPage] = useState(1)
  const limit = 20
  const { data, loading, error, reload } = useApi(`/inventory/offers?page=${page}&limit=${limit}`, [page])
  const total = data?.total ?? 0

  return (
    <div>
      {error && <div className="mb-3"><ErrorBox message={error} onRetry={reload} /></div>}
      <Card className="mt-4">
        {loading ? <LoadingSpinner label="Loading offers…" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.06]">
                <th className="text-left px-5 py-3">Offer ID</th>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Resources</th>
                <th className="text-left px-5 py-3">Valid Until</th>
                <th className="text-left px-5 py-3">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {(data?.items ?? []).map(o => (
                <tr key={o.id} className="hover:bg-white/[0.025] transition-colors">
                  <td className="px-5 py-3 font-mono text-[11px] text-slate-500 max-w-[140px] truncate" title={o.id}>{o.id}</td>
                  <td className="px-5 py-3 text-slate-200 font-semibold">{o.descriptor_name || '—'}</td>
                  <td className="px-5 py-3">
                    {o.resource_ids?.length
                      ? <span className="text-xs px-2 py-0.5 rounded-full border border-cyan-500/25 font-semibold" style={{ color: '#00b8e6', background: 'rgba(0,184,230,0.1)' }}>
                          {o.resource_ids.length} resource{o.resource_ids.length !== 1 ? 's' : ''}
                        </span>
                      : <span className="text-slate-600">—</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {o.validity_end?.Time ? fmtDateShort(o.validity_end.Time) : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{fmtDateShort(o.created_at?.Time || o.created_at)}</td>
                </tr>
              ))}
              {!data?.items?.length && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No offers published yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / limit))} onPage={setPage} total={total} limit={limit} />
      </Card>
    </div>
  )
}

function InventoryProductsTab() {
  const [search, setSearch]           = useState('')
  const [catalogFilter, setCatalogFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [page, setPage]               = useState(1)
  const limit = 20

  const url = `/inventory/items?search=${encodeURIComponent(search)}&catalog_id=${encodeURIComponent(catalogFilter)}&provider_id=${encodeURIComponent(providerFilter)}&page=${page}&limit=${limit}`
  const { data, loading, error, reload } = useApi(url, [search, catalogFilter, providerFilter, page])
  const { data: catData }  = useApi('/catalogs?limit=100', [])
  const { data: provData } = useApi('/providers', [])

  const items      = data?.items || []
  const total      = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const catalogs   = catData?.items || []
  const providers  = provData?.items || []

  // Group items by provider then catalog
  const grouped = {}
  items.forEach(item => {
    const pKey = item.providerName || item.providerId
    const cKey = item.catalogName || item.catalogId
    if (!grouped[pKey]) grouped[pKey] = {}
    if (!grouped[pKey][cKey]) grouped[pKey][cKey] = []
    grouped[pKey][cKey].push(item)
  })

  return (
    <div className="space-y-4 mt-6">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-44">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by name or ID…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 border border-white/[0.08] bg-slate-900 focus:outline-none focus:border-blue-500/50 transition-colors" />
          </div>
          <select value={providerFilter} onChange={e => { setProviderFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg text-sm text-white border border-white/[0.08] bg-slate-900 focus:outline-none">
            <option value="">All Providers</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={catalogFilter} onChange={e => { setCatalogFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg text-sm text-white border border-white/[0.08] bg-slate-900 focus:outline-none">
            <option value="">All Catalogs</option>
            {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={reload} className="p-2 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : error ? <ErrorBox message={error} /> : (
        Object.keys(grouped).length === 0 ? (
          <Card className="p-12 text-center text-slate-500">No products found.</Card>
        ) : (
          Object.entries(grouped).map(([providerName, catalogs]) => (
            <div key={providerName} className="space-y-3">
              {/* Provider header */}
              <div className="flex items-center gap-2 px-1">
                <Store size={14} className="text-slate-500" />
                <p className="text-sm font-bold text-slate-300">{providerName}</p>
              </div>
              {Object.entries(catalogs).map(([catalogName, resources]) => (
                <Card key={catalogName}>
                  {/* Catalog sub-header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                    <BookOpen size={12} className="text-slate-500" />
                    <p className="text-xs font-semibold text-slate-400">{catalogName}</p>
                    <span className="ml-auto text-[10px] text-slate-600">{resources.length} products</span>
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr>
                        {['Resource', 'Description', 'Stock', 'Sold'].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-[10px] uppercase tracking-widest text-slate-600 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resources.map(r => (
                        <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-white text-sm">{r.name}</p>
                            <p className="text-[11px] font-mono text-slate-600">{r.id}</p>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 max-w-48 truncate">{r.shortDesc || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-sm font-bold ${r.stock === 0 ? 'text-red-400' : r.stock <= 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {r.stock}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-sm">{r.sold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </Card>
              ))}
            </div>
          ))
        )
      )}
      <Pagination page={page} totalPages={totalPages} onPage={setPage} total={total} limit={limit} />
    </div>
  )
}

function InventoryPage({ initialTab = 'products' }) {
  const [tab, setTab] = useState(initialTab)
  return (
    <div>
      <PageHeader breadcrumb="Inventory" title="Your Inventory"
        subtitle="Products by provider & catalog, with stock levels" />
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {['products', 'resources', 'offers', 'stock'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              tab !== t ? 'text-slate-400 hover:text-slate-200' : 'text-white shadow-lg'
            }`}
            style={tab === t ? { background: BRAND } : {}}>
            {t === 'products' ? '🏪 By Catalog' : t === 'resources' ? '📦 Resources' : t === 'offers' ? '🏷️ Offers' : '📊 Stock'}
          </button>
        ))}
      </div>
      {tab === 'products' ? <InventoryProductsTab />
        : tab === 'resources' ? <ResourcesTab />
        : tab === 'offers' ? <OffersTab />
        : <StockTab />}
    </div>
  )
}

// ─── Publish ──────────────────────────────────────────────────────────────────

const EMPTY_RESOURCE = () => ({
  id: '', name: '', short_desc: '', long_desc: '', stock_quantity: '',
  media_url: '',
  // identity
  brand: '', origin_country: 'IN',
  // physical
  weight_value: '', weight_unit: 'G',
  volume_value: '', volume_unit: 'ML',
  dim_unit: 'CM', dim_length: '', dim_breadth: '', dim_height: '',
  color: '', material: '', finish: '',
  // packaged goods
  mfr_type: 'MANUFACTURER', mfr_name: '', mfr_address: '',
  common_name: '',
  net_qty_value: '', net_qty_unit: 'ML',
})

const EMPTY_OFFER = () => ({
  id: '', name: '', short_desc: '', resource_ids: '', price: '', currency: 'INR',
  validity_start: '', validity_end: '',
  // offer attributes
  offer_context: 'https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailOffer/v2.1/context.jsonld',
  // policies
  returns_allowed: true,  returns_window: 'P7D',  returns_method: 'SELLER_PICKUP',
  cancel_allowed:  true,  cancel_window:  'PT2H', cancel_event:   'BEFORE_PACKING',
  replace_allowed: true,  replace_window: 'P7D',  replace_method: 'SELLER_PICKUP', replace_subject_avail: true,
  // payment & serviceability
  cod_available: true,
  max_distance: '15', distance_unit: 'KM',
  timing_days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
  timing_start: '09:00', timing_end: '21:00',
})

const CATALOG_TYPES  = ['', 'regular']
const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// ---------------------------------------------------------------------------
// Auto-fill seed data — pool of real Indonesian snack products.
// Each entry maps 1:1 to a complete form state (catalog + 1 resource + 1 offer).
// ---------------------------------------------------------------------------
const AUTO_FILL_POOL = [
  {
    catalog_id: 'cat-khong-guan-001', catalog_name: 'Toko Camilan Nusantara', catalog_type: '',
    provider_id: 'provider-toko-nusantara-001', provider_name: 'Toko Camilan Nusantara',
    validity_start: '2026-04-11', validity_end: '2027-04-11',
    resources: [{
      ...EMPTY_RESOURCE(),
      id: 'res-biscuit-khong-guan-001',
      name: 'Biskuit Kaleng Khong Guan (Khong Guan Assorted Biscuits Tin)',
      short_desc: 'Aneka biskuit renyah dalam kaleng ikonik (Assorted crispy biscuits in iconic tin)',
      long_desc: 'Koleksi biskuit klasik Khong Guan dengan berbagai rasa: vanila, cokelat, dan keju. Hadir dalam kaleng dekoratif yang bisa digunakan kembali. (Classic Khong Guan biscuit collection with vanilla, chocolate, and cheese varieties in a reusable decorative tin.)',
      media_url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=800&q=80',
      stock_quantity: '200', brand: 'Khong Guan', origin_country: 'ID',
      weight_value: '1600', weight_unit: 'G', color: 'Red', material: 'Tin', finish: 'Glossy',
      mfr_type: 'MANUFACTURER', mfr_name: 'Khong Guan Biscuit Factory Pte Ltd', mfr_address: 'Jakarta, DKI Jakarta, ID',
      common_name: 'Biskuit Assorted (Assorted Biscuits)', net_qty_value: '1600', net_qty_unit: 'G',
    }],
    offers: [{
      ...EMPTY_OFFER(),
      id: 'offer-biscuit-khong-guan-001', name: 'Biskuit Kaleng Khong Guan (Khong Guan Assorted Biscuits Tin)',
      short_desc: 'Aneka biskuit renyah dalam kaleng ikonik', resource_ids: 'res-biscuit-khong-guan-001',
      price: '185000', currency: 'IDR', validity_start: '2026-04-11', validity_end: '2027-04-11',
    }],
  },
  {
    catalog_id: 'cat-chitato-001', catalog_name: 'Toko Camilan Nusantara', catalog_type: '',
    provider_id: 'provider-toko-nusantara-001', provider_name: 'Toko Camilan Nusantara',
    validity_start: '2026-04-11', validity_end: '2027-04-11',
    resources: [{
      ...EMPTY_RESOURCE(),
      id: 'res-chips-chitato-sapi-003',
      name: 'Keripik Chitato Rasa Sapi Panggang (Chitato Beef BBQ Potato Chips)',
      short_desc: 'Keripik kentang gurih rasa sapi panggang (Crunchy potato chips with BBQ beef flavor)',
      long_desc: 'Chitato hadir dengan rasa Sapi Panggang yang kaya dan bumbu khas Indonesia. Dibuat dari kentang pilihan yang diproses dengan teknologi modern untuk tekstur renyah sempurna. (Chitato with rich BBQ Beef flavor and distinctive Indonesian seasoning, made from selected potatoes for perfect crunch.)',
      media_url: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=800&q=80',
      stock_quantity: '1000', brand: 'Chitato', origin_country: 'ID',
      weight_value: '68', weight_unit: 'G', color: 'Red', material: 'Plastic', finish: 'Glossy',
      mfr_type: 'MANUFACTURER', mfr_name: 'PT Indofood CBP Sukses Makmur Tbk', mfr_address: 'Jakarta, DKI Jakarta, ID',
      common_name: 'Keripik Kentang (Potato Chips)', net_qty_value: '68', net_qty_unit: 'G',
    }],
    offers: [{
      ...EMPTY_OFFER(),
      id: 'offer-chips-chitato-sapi-003', name: 'Keripik Chitato Rasa Sapi Panggang (Chitato Beef BBQ Potato Chips)',
      short_desc: 'Keripik kentang gurih rasa sapi panggang', resource_ids: 'res-chips-chitato-sapi-003',
      price: '12000', currency: 'IDR', validity_start: '2026-04-11', validity_end: '2027-04-11',
      returns_allowed: false, replace_window: 'P3D',
    }],
  },
  {
    catalog_id: 'cat-lapis-legit-001', catalog_name: 'Toko Camilan Nusantara', catalog_type: '',
    provider_id: 'provider-toko-nusantara-001', provider_name: 'Toko Camilan Nusantara',
    validity_start: '2026-04-11', validity_end: '2027-04-11',
    resources: [{
      ...EMPTY_RESOURCE(),
      id: 'res-cake-lapis-legit-005',
      name: 'Kue Lapis Legit Premium (Premium Spekkoek Layered Cake)',
      short_desc: 'Kue lapis klasik Belanda-Indonesia dengan lapisan sempurna (Classic Dutch-Indonesian layered cake)',
      long_desc: 'Lapis Legit adalah kue tradisional warisan Belanda-Indonesia yang dibuat dengan lebih dari 18 lapisan tipis. Setiap lapisan dipanggang satu per satu menggunakan rempah pilihan seperti kayu manis, cengkeh, dan kapulaga. (Lapis Legit is a traditional Dutch-Indonesian heritage cake with over 18 thin layers, each baked individually using selected spices like cinnamon, cloves, and cardamom.)',
      media_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80',
      stock_quantity: '50', brand: 'Dapur Lapis', origin_country: 'ID',
      weight_value: '700', weight_unit: 'G', color: 'Brown', material: 'Paper Box', finish: 'Matte',
      mfr_type: 'MANUFACTURER', mfr_name: 'CV Dapur Lapis Nusantara', mfr_address: 'Bandung, Jawa Barat, ID',
      common_name: 'Kue Lapis Legit (Spekkoek Cake)', net_qty_value: '700', net_qty_unit: 'G',
    }],
    offers: [{
      ...EMPTY_OFFER(),
      id: 'offer-cake-lapis-legit-005', name: 'Kue Lapis Legit Premium (Premium Spekkoek Layered Cake)',
      short_desc: 'Kue lapis klasik Belanda-Indonesia', resource_ids: 'res-cake-lapis-legit-005',
      price: '185000', currency: 'IDR', validity_start: '2026-04-11', validity_end: '2027-04-11',
      returns_allowed: false, replace_allowed: false, max_distance: '10',
    }],
  },
  {
    catalog_id: 'cat-monde-butter-001', catalog_name: 'Toko Camilan Nusantara', catalog_type: '',
    provider_id: 'provider-toko-nusantara-001', provider_name: 'Toko Camilan Nusantara',
    validity_start: '2026-04-11', validity_end: '2027-04-11',
    resources: [{
      ...EMPTY_RESOURCE(),
      id: 'res-biscuit-monde-butter-007',
      name: 'Biskuit Monde Butter Cookies (Monde Butter Cookies)',
      short_desc: 'Kue kering butter premium dalam kaleng cantik (Premium butter cookies in a beautiful tin)',
      long_desc: 'Monde Butter Cookies hadir dalam kaleng premium dengan pilihan cookies berbentuk bunga, pretzel, dan cinnamon. Dibuat dari butter pilihan berkualitas tinggi dengan tekstur yang lumer di mulut. (Monde Butter Cookies in premium tin with flower-shaped, pretzel, and cinnamon cookie varieties. Made from high-quality selected butter with a melt-in-your-mouth texture.)',
      media_url: 'https://images.unsplash.com/photo-1548365328-8c6db3220e4c?w=800&q=80',
      stock_quantity: '150', brand: 'Monde', origin_country: 'ID',
      weight_value: '454', weight_unit: 'G', color: 'Blue', material: 'Tin', finish: 'Glossy',
      mfr_type: 'MANUFACTURER', mfr_name: 'PT Monde Mahkota Biskuit', mfr_address: 'Jakarta, DKI Jakarta, ID',
      common_name: 'Kue Kering Butter (Butter Cookies)', net_qty_value: '454', net_qty_unit: 'G',
    }],
    offers: [{
      ...EMPTY_OFFER(),
      id: 'offer-biscuit-monde-butter-007', name: 'Biskuit Monde Butter Cookies (Monde Butter Cookies)',
      short_desc: 'Kue kering butter premium dalam kaleng cantik', resource_ids: 'res-biscuit-monde-butter-007',
      price: '120000', currency: 'IDR', validity_start: '2026-04-11', validity_end: '2027-04-11',
    }],
  },
  {
    catalog_id: 'cat-brownies-amanda-001', catalog_name: 'Toko Camilan Nusantara', catalog_type: '',
    provider_id: 'provider-toko-nusantara-001', provider_name: 'Toko Camilan Nusantara',
    validity_start: '2026-04-11', validity_end: '2027-04-11',
    resources: [{
      ...EMPTY_RESOURCE(),
      id: 'res-cake-brownies-amanda-009',
      name: 'Brownies Kukus Amanda Cokelat (Amanda Steamed Chocolate Brownies)',
      short_desc: 'Brownies kukus lembut khas Bandung dengan cokelat premium (Soft steamed Bandung-style brownies)',
      long_desc: 'Brownies Kukus Amanda adalah ikon kuliner Bandung yang terkenal. Dibuat dengan cokelat premium, teksturnya sangat lembut dan basah. Tersedia dalam varian original, keju, dan tiramisu. (Amanda Steamed Brownies are a famous Bandung culinary icon. Made with premium chocolate, extremely soft and moist. Available in original, cheese, and tiramisu variants.)',
      media_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80',
      stock_quantity: '60', brand: 'Amanda', origin_country: 'ID',
      weight_value: '800', weight_unit: 'G', color: 'Brown', material: 'Cardboard', finish: 'Matte',
      mfr_type: 'MANUFACTURER', mfr_name: 'CV Amanda Brownies', mfr_address: 'Bandung, Jawa Barat, ID',
      common_name: 'Brownies Kukus (Steamed Brownies)', net_qty_value: '800', net_qty_unit: 'G',
    }],
    offers: [{
      ...EMPTY_OFFER(),
      id: 'offer-cake-brownies-amanda-009', name: 'Brownies Kukus Amanda Cokelat (Amanda Steamed Chocolate Brownies)',
      short_desc: 'Brownies kukus lembut khas Bandung dengan cokelat premium', resource_ids: 'res-cake-brownies-amanda-009',
      price: '95000', currency: 'IDR', validity_start: '2026-04-11', validity_end: '2027-04-11',
      returns_allowed: false, replace_allowed: false, max_distance: '10',
    }],
  },
]

// Build resourceAttributes JSON-LD object from flat form fields.
function buildResourceAttrs(r) {
  const hasIdentity  = r.brand || r.origin_country
  const hasPhysical  = r.weight_value || r.volume_value || r.dim_length || r.color || r.material || r.finish
  const hasPkg       = r.mfr_name || r.common_name || r.net_qty_value
  if (!hasIdentity && !hasPhysical && !hasPkg) return undefined

  const attrs = {
    '@context': 'https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailResource/v2.1/context.jsonld',
    '@type': 'RetailResource',
  }
  if (hasIdentity) {
    attrs.identity = {}
    if (r.brand)          attrs.identity.brand         = r.brand
    if (r.origin_country) attrs.identity.originCountry = r.origin_country
  }
  if (hasPhysical) {
    attrs.physical = {}
    if (r.weight_value) attrs.physical.weight     = { unitCode: r.weight_unit, unitQuantity: Number(r.weight_value) }
    if (r.volume_value) attrs.physical.volume     = { unitCode: r.volume_unit, unitQuantity: Number(r.volume_value) }
    if (r.dim_length || r.dim_breadth || r.dim_height)
      attrs.physical.dimensions = { unit: r.dim_unit, length: Number(r.dim_length) || 0, breadth: Number(r.dim_breadth) || 0, height: Number(r.dim_height) || 0 }
    if (r.color || r.material || r.finish) {
      attrs.physical.appearance = {}
      if (r.color)    attrs.physical.appearance.color    = r.color
      if (r.material) attrs.physical.appearance.material = r.material
      if (r.finish)   attrs.physical.appearance.finish   = r.finish
    }
  }
  if (hasPkg) {
    attrs.packagedGoodsDeclaration = {}
    if (r.mfr_name) attrs.packagedGoodsDeclaration.manufacturerOrPacker = { type: r.mfr_type, name: r.mfr_name, ...(r.mfr_address ? { address: r.mfr_address } : {}) }
    if (r.common_name) attrs.packagedGoodsDeclaration.commonOrGenericName = r.common_name
    if (r.net_qty_value) attrs.packagedGoodsDeclaration.netQuantity = { unitCode: r.net_qty_unit, unitQuantity: Number(r.net_qty_value) }
  }
  return attrs
}

// Build offerAttributes JSON-LD from flat form fields.
// Returns undefined when no meaningful attributes are set so the field is
// omitted from the payload entirely (avoids sending a broken @context to CDS).
function buildOfferAttrs(o) {
  const hasPolicies     = o.returns_allowed || o.cancel_allowed || o.replace_allowed
  const hasPayment      = o.cod_available
  const hasServiceability = o.max_distance || (o.timing_days && o.timing_days.length > 0)
  const hasContext      = o.offer_context

  if (!hasPolicies && !hasPayment && !hasServiceability && !hasContext) return undefined

  const attrs = { '@type': 'RetailOffer' }
  if (hasContext) attrs['@context'] = o.offer_context

  if (hasPolicies) {
    attrs.policies = {
      returns:      { allowed: !!o.returns_allowed,  ...(o.returns_allowed  ? { window: o.returns_window,  method: o.returns_method } : {}) },
      cancellation: { allowed: !!o.cancel_allowed,   ...(o.cancel_allowed   ? { window: o.cancel_window,   cutoffEvent: o.cancel_event } : {}) },
      replacement:  { allowed: !!o.replace_allowed,  ...(o.replace_allowed  ? { window: o.replace_window,  method: o.replace_method, subjectToAvailability: !!o.replace_subject_avail } : {}) },
    }
  }
  if (hasPayment) attrs.paymentConstraints = { codAvailable: true }

  if (hasServiceability) {
    attrs.serviceability = {}
    if (o.max_distance) {
      attrs.serviceability.distanceConstraint = { maxDistance: Number(o.max_distance), unit: o.distance_unit || 'KM' }
    }
    if (o.timing_days && o.timing_days.length > 0) {
      attrs.serviceability.timing = [{ daysOfWeek: o.timing_days, timeRange: { start: o.timing_start || '09:00', end: o.timing_end || '21:00' } }]
    }
  }
  return attrs
}

function PublishPage({ onNav }) {
  const [step, setStep]       = useState(0) // 0=catalog, 1=resources, 2=offers, 3=review
  const [form, setForm]       = useState({
    catalog_id: '', catalog_name: '', provider_id: '', provider_name: '', catalog_type: '',
    validity_start: '', validity_end: '',
    resources: [EMPTY_RESOURCE()], offers: [EMPTY_OFFER()],
  })
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [autoFillIdx, setAutoFillIdx] = useState(0)
  // track which resource/offer "advanced" sections are expanded
  const [resOpen, setResOpen] = useState({})
  const [offOpen, setOffOpen] = useState({})

  // Cycle through AUTO_FILL_POOL on each click so consecutive clicks give different products.
  // A short hex suffix is appended to every ID to guarantee uniqueness across publishes.
  const handleAutoFill = () => {
    const seed  = AUTO_FILL_POOL[autoFillIdx % AUTO_FILL_POOL.length]
    const suffix = Date.now().toString(36) // e.g. "lf3k2a"
    const uid    = id => `${id}-${suffix}`

    setForm({
      ...seed,
      catalog_id: uid(seed.catalog_id),
      resources: seed.resources.map(r => ({ ...r, id: uid(r.id) })),
      offers: seed.offers.map(o => ({
        ...o,
        id:           uid(o.id),
        resource_ids: o.resource_ids.split(',').map(rid => uid(rid.trim())).join(', '),
      })),
    })
    setAutoFillIdx(i => i + 1)
    setResOpen({})
    setOffOpen({})
    setStep(0)
  }

  const STEPS = ['Catalog Info', 'Resources', 'Offers', 'Review & Publish']

  const setField         = (k, v)    => setForm(f => ({ ...f, [k]: v }))
  const setResourceField = (i, k, v) => setForm(f => { const r = [...f.resources]; r[i] = { ...r[i], [k]: v }; return { ...f, resources: r } })
  const setOfferField    = (i, k, v) => setForm(f => { const o = [...f.offers];    o[i] = { ...o[i], [k]: v }; return { ...f, offers: o } })
  const toggleDay        = (i, day)  => setForm(f => {
    const o = [...f.offers]; const days = o[i].timing_days
    o[i] = { ...o[i], timing_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] }
    return { ...f, offers: o }
  })
  const toISO = dt => dt ? new Date(dt).toISOString() : undefined

  const handleSubmit = async () => {
    setLoading(true); setError(null)
    try {
      const catStart = toISO(form.validity_start), catEnd = toISO(form.validity_end)
      const catalog = {
        id: form.catalog_id,
        descriptor: { name: form.catalog_name },
        provider: { id: form.provider_id, descriptor: { name: form.provider_name } },
        ...(catStart ? { validity: { startDate: catStart, endDate: catEnd } } : {}),
        resources: form.resources.map(r => {
          const mediaFile = r.media_url ? [{ uri: r.media_url, mimeType: 'image/jpeg' }] : undefined
          const attrs = buildResourceAttrs(r)
          return {
            id: r.id,
            descriptor: {
              name: r.name, shortDesc: r.short_desc, longDesc: r.long_desc,
              ...(mediaFile ? { mediaFile } : {}),
            },
            ...(attrs ? { resourceAttributes: attrs } : {}),
            ...(r.stock_quantity !== '' && !isNaN(Number(r.stock_quantity)) ? { stockQuantity: Number(r.stock_quantity) } : {}),
          }
        }),
        offers: form.offers.map(o => {
          const start = toISO(o.validity_start), end = toISO(o.validity_end)
          const offerAttrs = buildOfferAttrs(o)
          return {
            id: o.id,
            descriptor: { name: o.name, shortDesc: o.short_desc },
            resourceIds: o.resource_ids.split(',').map(s => s.trim()).filter(Boolean),
            ...(o.price ? { considerations: [{ id: `${o.id}-price`, status: { code: 'ACTIVE', name: 'ACTIVE' },
              considerationAttributes: {
                '@context': 'https://schema.beckn.io/RetailConsideration/v2.1/context.jsonld',
                '@type': 'RetailConsideration',
                currency: o.currency,
                breakup: [{ title: o.name || o.id, amount: Number(o.price), type: 'BASE_PRICE' }],
                totalAmount: Number(o.price),
                paymentMethods: o.cod_available ? ['PREPAID', 'COD', 'UPI'] : ['PREPAID', 'UPI'],
              } }] } : {}),
            ...(start ? { validity: { startDate: start, endDate: end } } : {}),
            ...(offerAttrs ? { offerAttributes: offerAttrs } : {}),
          }
        }),
        ...(form.catalog_type ? { publishDirectives: { catalogType: form.catalog_type } } : {}),
      }
      await apiFetch('/catalog/publish', { method: 'POST', body: JSON.stringify({ catalogs: [catalog] }) })
      onNav('inventory')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const inputCls = 'w-full bg-slate-900 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 focus:bg-slate-800 transition-all'
  const labelCls = 'block text-xs font-semibold text-slate-400 mb-1.5'

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <PageHeader breadcrumb="Publish Catalog" title="Publish to Network"
          subtitle="Push your resources and offers to the ION network" />
        <button onClick={handleAutoFill}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-dashed border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/70 transition-all active:scale-95 mt-1"
          title="Auto-fill form with a sample Indonesian product">
          <Wand2 size={15} /> Auto-fill Sample
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <button onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 text-xs font-semibold transition-all ${
                i < step ? 'cursor-pointer' : 'cursor-default'
              }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                i < step ? 'bg-emerald-500 text-white' :
                i === step ? 'text-white' : 'bg-slate-800 text-slate-500'
              }`}
                style={i === step ? { background: BRAND } : {}}>
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={i === step ? 'text-white' : i < step ? 'text-emerald-400' : 'text-slate-500'}>{s}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className="flex-1 mx-3 h-px" style={{ background: i < step ? '#10b981' : 'rgba(255,255,255,0.08)' }} />
            )}
          </div>
        ))}
      </div>

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.18 }}>

          {/* ── Step 0: Catalog Info ── */}
          {step === 0 && (
            <Card className="p-6 space-y-5">
              <p className="text-sm font-bold text-white">Catalog Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>Catalog ID *</label>
                  <input className={inputCls} value={form.catalog_id} onChange={e => setField('catalog_id', e.target.value)} placeholder="cat-venky-bazaar-2026" required />
                </div>
                <div><label className={labelCls}>Catalog Name *</label>
                  <input className={inputCls} value={form.catalog_name} onChange={e => setField('catalog_name', e.target.value)} placeholder="Venky Bazaar Catalog" required />
                </div>
                <div><label className={labelCls}>Provider ID *</label>
                  <input className={inputCls} value={form.provider_id} onChange={e => setField('provider_id', e.target.value)} placeholder="provider-venky-bazaar" required />
                </div>
                <div><label className={labelCls}>Provider Name *</label>
                  <input className={inputCls} value={form.provider_name} onChange={e => setField('provider_name', e.target.value)} placeholder="Venky.Mahadevan@Bazaar" required />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Catalog Type <span className="text-slate-600 font-normal">(optional)</span></label>
                  <select className={inputCls} value={form.catalog_type} onChange={e => setField('catalog_type', e.target.value)}>
                    {CATALOG_TYPES.map(t => <option key={t} value={t}>{t || '— select type —'}</option>)}
                  </select>
                </div>
              </div>
              {/* Catalog validity */}
              <div className="pt-3 border-t border-white/[0.06]">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Catalog Validity <span className="text-slate-600 font-normal normal-case">(optional)</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={labelCls}>Valid From</label>
                    <input type="datetime-local" className={inputCls} value={form.validity_start} onChange={e => setField('validity_start', e.target.value)} />
                  </div>
                  <div><label className={labelCls}>Valid Until</label>
                    <input type="datetime-local" className={inputCls} value={form.validity_end} onChange={e => setField('validity_end', e.target.value)} />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ── Step 1: Resources ── */}
          {step === 1 && (
            <div className="space-y-3 max-w-2xl">
              {form.resources.map((r, i) => (
                <Card key={i} className="p-5">
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white" style={{ background: BRAND }}>{i + 1}</div>
                      <p className="text-sm font-bold text-white">Resource {i + 1}</p>
                    </div>
                    {form.resources.length > 1 && (
                      <button onClick={() => setForm(f => ({ ...f, resources: f.resources.filter((_, j) => j !== i) }))}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </div>

                  {/* Basic info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Resource ID *</label>
                      <input className={inputCls} value={r.id} onChange={e => setResourceField(i, 'id', e.target.value)} placeholder="item-flask-mh500-yellow" required />
                    </div>
                    <div><label className={labelCls}>Name *</label>
                      <input className={inputCls} value={r.name} onChange={e => setResourceField(i, 'name', e.target.value)} placeholder="Stainless Steel Hiking Flask" required />
                    </div>
                    <div><label className={labelCls}>Short Description</label>
                      <input className={inputCls} value={r.short_desc} onChange={e => setResourceField(i, 'short_desc', e.target.value)} placeholder="500ml insulated flask" />
                    </div>
                    <div><label className={labelCls}>Long Description</label>
                      <input className={inputCls} value={r.long_desc} onChange={e => setResourceField(i, 'long_desc', e.target.value)} placeholder="Full product description…" />
                    </div>
                    <div><label className={labelCls}>Stock Quantity <span className="text-slate-600 font-normal">(blank = unlimited)</span></label>
                      <input className={inputCls} type="number" min="0" value={r.stock_quantity} onChange={e => setResourceField(i, 'stock_quantity', e.target.value)} placeholder="e.g. 50" />
                    </div>
                    <div><label className={labelCls}>Image URL <span className="text-slate-600 font-normal">(optional)</span></label>
                      <input className={inputCls} value={r.media_url} onChange={e => setResourceField(i, 'media_url', e.target.value)} placeholder="https://example.com/product.jpg" />
                    </div>
                  </div>

                  {/* Identity & Physical — collapsible */}
                  <button onClick={() => setResOpen(s => ({ ...s, [`${i}_phys`]: !s[`${i}_phys`] }))}
                    className="mt-4 w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors pt-3 border-t border-white/[0.06]">
                    <span>🏷️ Identity &amp; Physical Attributes</span>
                    <ChevronRightIcon size={13} className={`transition-transform ${resOpen[`${i}_phys`] ? 'rotate-90' : ''}`} />
                  </button>
                  {resOpen[`${i}_phys`] && (
                    <div className="mt-3 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className={labelCls}>Brand</label>
                          <input className={inputCls} value={r.brand} onChange={e => setResourceField(i, 'brand', e.target.value)} placeholder="InstaCuppa" />
                        </div>
                        <div><label className={labelCls}>Origin Country</label>
                          <input className={inputCls} value={r.origin_country} onChange={e => setResourceField(i, 'origin_country', e.target.value)} placeholder="IN" />
                        </div>
                      </div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Weight &amp; Volume</p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-2"><label className={labelCls}>Weight</label>
                          <input className={inputCls} type="number" value={r.weight_value} onChange={e => setResourceField(i, 'weight_value', e.target.value)} placeholder="350" />
                        </div>
                        <div className="col-span-2"><label className={labelCls}>Unit</label>
                          <select className={inputCls} value={r.weight_unit} onChange={e => setResourceField(i, 'weight_unit', e.target.value)}>
                            {['G', 'KG', 'MG', 'OZ', 'LB'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2"><label className={labelCls}>Volume</label>
                          <input className={inputCls} type="number" value={r.volume_value} onChange={e => setResourceField(i, 'volume_value', e.target.value)} placeholder="500" />
                        </div>
                        <div className="col-span-2"><label className={labelCls}>Unit</label>
                          <select className={inputCls} value={r.volume_unit} onChange={e => setResourceField(i, 'volume_unit', e.target.value)}>
                            {['ML', 'L', 'FL_OZ'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Dimensions</p>
                      <div className="grid grid-cols-4 gap-2">
                        <div><label className={labelCls}>L (cm)</label>
                          <input className={inputCls} type="number" value={r.dim_length} onChange={e => setResourceField(i, 'dim_length', e.target.value)} placeholder="25" />
                        </div>
                        <div><label className={labelCls}>B (cm)</label>
                          <input className={inputCls} type="number" value={r.dim_breadth} onChange={e => setResourceField(i, 'dim_breadth', e.target.value)} placeholder="7" />
                        </div>
                        <div><label className={labelCls}>H (cm)</label>
                          <input className={inputCls} type="number" value={r.dim_height} onChange={e => setResourceField(i, 'dim_height', e.target.value)} placeholder="7" />
                        </div>
                        <div><label className={labelCls}>Unit</label>
                          <select className={inputCls} value={r.dim_unit} onChange={e => setResourceField(i, 'dim_unit', e.target.value)}>
                            {['CM', 'MM', 'IN'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Appearance</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className={labelCls}>Color</label>
                          <input className={inputCls} value={r.color} onChange={e => setResourceField(i, 'color', e.target.value)} placeholder="Yellow" />
                        </div>
                        <div><label className={labelCls}>Material</label>
                          <input className={inputCls} value={r.material} onChange={e => setResourceField(i, 'material', e.target.value)} placeholder="Stainless Steel" />
                        </div>
                        <div><label className={labelCls}>Finish</label>
                          <input className={inputCls} value={r.finish} onChange={e => setResourceField(i, 'finish', e.target.value)} placeholder="Matte" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Packaged goods — collapsible */}
                  <button onClick={() => setResOpen(s => ({ ...s, [`${i}_pkg`]: !s[`${i}_pkg`] }))}
                    className="mt-4 w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors pt-3 border-t border-white/[0.06]">
                    <span>📦 Packaged Goods Declaration</span>
                    <ChevronRightIcon size={13} className={`transition-transform ${resOpen[`${i}_pkg`] ? 'rotate-90' : ''}`} />
                  </button>
                  {resOpen[`${i}_pkg`] && (
                    <div className="mt-3 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className={labelCls}>Manufacturer Type</label>
                          <select className={inputCls} value={r.mfr_type} onChange={e => setResourceField(i, 'mfr_type', e.target.value)}>
                            {['MANUFACTURER', 'PACKER', 'IMPORTER'].map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div><label className={labelCls}>Manufacturer Name</label>
                          <input className={inputCls} value={r.mfr_name} onChange={e => setResourceField(i, 'mfr_name', e.target.value)} placeholder="InstaCuppa India Pvt Ltd" />
                        </div>
                        <div className="col-span-2"><label className={labelCls}>Manufacturer Address</label>
                          <input className={inputCls} value={r.mfr_address} onChange={e => setResourceField(i, 'mfr_address', e.target.value)} placeholder="Bangalore, Karnataka, IN" />
                        </div>
                        <div><label className={labelCls}>Common / Generic Name</label>
                          <input className={inputCls} value={r.common_name} onChange={e => setResourceField(i, 'common_name', e.target.value)} placeholder="Stainless Steel Vacuum Flask" />
                        </div>
                        <div><label className={labelCls}>Net Qty</label>
                          <div className="flex gap-2">
                            <input className={inputCls} type="number" value={r.net_qty_value} onChange={e => setResourceField(i, 'net_qty_value', e.target.value)} placeholder="500" />
                            <select className={inputCls + ' w-24 shrink-0'} value={r.net_qty_unit} onChange={e => setResourceField(i, 'net_qty_unit', e.target.value)}>
                              {['ML', 'L', 'G', 'KG', 'PCS'].map(u => <option key={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              <button onClick={() => setForm(f => ({ ...f, resources: [...f.resources, EMPTY_RESOURCE()] }))}
                className="w-full py-3 rounded-xl border border-dashed border-white/[0.12] text-sm text-slate-400 hover:text-slate-200 hover:border-white/20 flex items-center justify-center gap-2 transition-all">
                <Plus size={14} /> Add Another Resource
              </button>
            </div>
          )}

          {/* ── Step 2: Offers ── */}
          {step === 2 && (
            <div className="space-y-3 max-w-2xl">
              {form.offers.map((o, i) => (
                <Card key={i} className="p-5">
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white" style={{ background: BRAND2 }}>{i + 1}</div>
                      <p className="text-sm font-bold text-white">Offer {i + 1}</p>
                    </div>
                    {form.offers.length > 1 && (
                      <button onClick={() => setForm(f => ({ ...f, offers: f.offers.filter((_, j) => j !== i) }))}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </div>

                  {/* Basic info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Offer ID *</label>
                      <input className={inputCls} value={o.id} onChange={e => setOfferField(i, 'id', e.target.value)} placeholder="offer-flask-mh500-yellow" required />
                    </div>
                    <div><label className={labelCls}>Offer Name *</label>
                      <input className={inputCls} value={o.name} onChange={e => setOfferField(i, 'name', e.target.value)} placeholder="Hiking Flask MH500 Yellow" required />
                    </div>
                    <div className="col-span-2"><label className={labelCls}>Short Description</label>
                      <input className={inputCls} value={o.short_desc} onChange={e => setOfferField(i, 'short_desc', e.target.value)} placeholder="Brief offer description" />
                    </div>
                    <div className="col-span-2"><label className={labelCls}>Resource IDs <span className="text-slate-600 font-normal">(comma-separated)</span></label>
                      <input className={inputCls} value={o.resource_ids} onChange={e => setOfferField(i, 'resource_ids', e.target.value)} placeholder="item-flask-mh500-yellow" />
                    </div>
                    <div><label className={labelCls}>Price</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                        <input className={inputCls + ' pl-7'} value={o.price} onChange={e => setOfferField(i, 'price', e.target.value)} placeholder="799" />
                      </div>
                    </div>
                    <div><label className={labelCls}>Currency</label>
                      <input className={inputCls} value={o.currency} onChange={e => setOfferField(i, 'currency', e.target.value)} placeholder="INR" />
                    </div>
                    <div><label className={labelCls}>Validity Start</label>
                      <input type="datetime-local" className={inputCls} value={o.validity_start} onChange={e => setOfferField(i, 'validity_start', e.target.value)} />
                    </div>
                    <div><label className={labelCls}>Validity End</label>
                      <input type="datetime-local" className={inputCls} value={o.validity_end} onChange={e => setOfferField(i, 'validity_end', e.target.value)} />
                    </div>
                  </div>

                  {/* Policies — collapsible */}
                  <button onClick={() => setOffOpen(s => ({ ...s, [`${i}_pol`]: !s[`${i}_pol`] }))}
                    className="mt-4 w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors pt-3 border-t border-white/[0.06]">
                    <span>📋 Policies (Returns · Cancellation · Replacement)</span>
                    <ChevronRightIcon size={13} className={`transition-transform ${offOpen[`${i}_pol`] ? 'rotate-90' : ''}`} />
                  </button>
                  {offOpen[`${i}_pol`] && (
                    <div className="mt-3 space-y-4">
                      {/* Returns */}
                      <div className="p-3 rounded-lg border border-white/[0.06]" style={{ background: 'rgba(0,184,230,0.04)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-cyan-400">Returns</p>
                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input type="checkbox" className="rounded" checked={o.returns_allowed} onChange={e => setOfferField(i, 'returns_allowed', e.target.checked)} />
                            Allowed
                          </label>
                        </div>
                        {o.returns_allowed && (
                          <div className="grid grid-cols-2 gap-2">
                            <div><label className={labelCls}>Window (ISO 8601)</label>
                              <input className={inputCls} value={o.returns_window} onChange={e => setOfferField(i, 'returns_window', e.target.value)} placeholder="P7D" />
                            </div>
                            <div><label className={labelCls}>Method</label>
                              <select className={inputCls} value={o.returns_method} onChange={e => setOfferField(i, 'returns_method', e.target.value)}>
                                {['SELLER_PICKUP', 'BUYER_DROP', 'REVERSE_PICKUP'].map(m => <option key={m}>{m}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Cancellation */}
                      <div className="p-3 rounded-lg border border-white/[0.06]" style={{ background: 'rgba(245,158,11,0.04)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-amber-400">Cancellation</p>
                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input type="checkbox" className="rounded" checked={o.cancel_allowed} onChange={e => setOfferField(i, 'cancel_allowed', e.target.checked)} />
                            Allowed
                          </label>
                        </div>
                        {o.cancel_allowed && (
                          <div className="grid grid-cols-2 gap-2">
                            <div><label className={labelCls}>Window (ISO 8601)</label>
                              <input className={inputCls} value={o.cancel_window} onChange={e => setOfferField(i, 'cancel_window', e.target.value)} placeholder="PT2H" />
                            </div>
                            <div><label className={labelCls}>Cutoff Event</label>
                              <select className={inputCls} value={o.cancel_event} onChange={e => setOfferField(i, 'cancel_event', e.target.value)}>
                                {['BEFORE_PACKING', 'BEFORE_DISPATCH', 'BEFORE_DELIVERY'].map(e => <option key={e}>{e}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Replacement */}
                      <div className="p-3 rounded-lg border border-white/[0.06]" style={{ background: 'rgba(16,185,129,0.04)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-emerald-400">Replacement</p>
                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input type="checkbox" className="rounded" checked={o.replace_allowed} onChange={e => setOfferField(i, 'replace_allowed', e.target.checked)} />
                            Allowed
                          </label>
                        </div>
                        {o.replace_allowed && (
                          <div className="grid grid-cols-2 gap-2">
                            <div><label className={labelCls}>Window (ISO 8601)</label>
                              <input className={inputCls} value={o.replace_window} onChange={e => setOfferField(i, 'replace_window', e.target.value)} placeholder="P7D" />
                            </div>
                            <div><label className={labelCls}>Method</label>
                              <select className={inputCls} value={o.replace_method} onChange={e => setOfferField(i, 'replace_method', e.target.value)}>
                                {['SELLER_PICKUP', 'BUYER_DROP', 'REVERSE_PICKUP'].map(m => <option key={m}>{m}</option>)}
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                                <input type="checkbox" className="rounded" checked={o.replace_subject_avail} onChange={e => setOfferField(i, 'replace_subject_avail', e.target.checked)} />
                                Subject to availability
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Payment & Serviceability — collapsible */}
                  <button onClick={() => setOffOpen(s => ({ ...s, [`${i}_svc`]: !s[`${i}_svc`] }))}
                    className="mt-4 w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors pt-3 border-t border-white/[0.06]">
                    <span>🚚 Payment &amp; Serviceability</span>
                    <ChevronRightIcon size={13} className={`transition-transform ${offOpen[`${i}_svc`] ? 'rotate-90' : ''}`} />
                  </button>
                  {offOpen[`${i}_svc`] && (
                    <div className="mt-3 space-y-4">
                      <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer">
                        <input type="checkbox" className="rounded" checked={o.cod_available} onChange={e => setOfferField(i, 'cod_available', e.target.checked)} />
                        <span>Cash on Delivery (COD) available</span>
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2"><label className={labelCls}>Max Delivery Distance</label>
                          <input className={inputCls} type="number" value={o.max_distance} onChange={e => setOfferField(i, 'max_distance', e.target.value)} placeholder="15" />
                        </div>
                        <div><label className={labelCls}>Unit</label>
                          <select className={inputCls} value={o.distance_unit} onChange={e => setOfferField(i, 'distance_unit', e.target.value)}>
                            {['KM', 'MI'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Delivery Days</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {ALL_DAYS.map(day => (
                            <button key={day} type="button"
                              onClick={() => toggleDay(i, day)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                                o.timing_days.includes(day)
                                  ? 'text-white border-cyan-500/40'
                                  : 'text-slate-500 border-white/[0.08] hover:border-white/20'
                              }`}
                              style={o.timing_days.includes(day) ? { background: 'rgba(0,184,230,0.15)' } : {}}>
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className={labelCls}>Delivery Window Start</label>
                          <input type="time" className={inputCls} value={o.timing_start} onChange={e => setOfferField(i, 'timing_start', e.target.value)} />
                        </div>
                        <div><label className={labelCls}>Delivery Window End</label>
                          <input type="time" className={inputCls} value={o.timing_end} onChange={e => setOfferField(i, 'timing_end', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              <button onClick={() => setForm(f => ({ ...f, offers: [...f.offers, EMPTY_OFFER()] }))}
                className="w-full py-3 rounded-xl border border-dashed border-white/[0.12] text-sm text-slate-400 hover:text-slate-200 hover:border-white/20 flex items-center justify-center gap-2 transition-all">
                <Plus size={14} /> Add Another Offer
              </button>
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 3 && (
            <div className="space-y-4">
              <Card className="p-5">
                <SectionTitle>Catalog</SectionTitle>
                <div className="space-y-2 text-sm">
                  {[
                    ['ID', form.catalog_id], ['Name', form.catalog_name],
                    ['Provider', `${form.provider_name} (${form.provider_id})`],
                    ['Type', form.catalog_type || 'Not set'],
                    ['Valid From', form.validity_start ? fmtDate(new Date(form.validity_start).toISOString()) : '—'],
                    ['Valid Until', form.validity_end   ? fmtDate(new Date(form.validity_end).toISOString())   : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-500">{k}</span>
                      <span className="text-slate-200 font-medium">{v || '—'}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <SectionTitle>Resources ({form.resources.length})</SectionTitle>
                <div className="space-y-3">
                  {form.resources.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      {r.media_url
                        ? <img src={r.media_url} alt={r.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/[0.08]" onError={e => { e.target.style.display='none' }} />
                        : <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(0,184,230,0.08)', border: '1px solid rgba(0,184,230,0.15)' }}><Package size={16} style={{ color: '#00b8e6' }} /></div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 font-semibold truncate">{r.name || '—'}</p>
                        <p className="text-[11px] font-mono text-slate-600">{r.id}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.brand && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">{r.brand}</span>}
                          {r.color && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">{r.color}</span>}
                          {r.material && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">{r.material}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border"
                        style={r.stock_quantity !== '' && !isNaN(Number(r.stock_quantity))
                          ? { color: '#00b8e6', borderColor: 'rgba(0,184,230,0.25)', background: 'rgba(0,184,230,0.08)' }
                          : { color: '#64748b', borderColor: 'rgba(255,255,255,0.08)' }}>
                        {r.stock_quantity !== '' && !isNaN(Number(r.stock_quantity)) ? `Qty: ${r.stock_quantity}` : '∞ Unlimited'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <SectionTitle>Offers ({form.offers.length})</SectionTitle>
                <div className="space-y-3">
                  {form.offers.map((o, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Tag size={13} className="text-slate-500 shrink-0" />
                          <span className="text-slate-200 font-semibold truncate">{o.name || '—'}</span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-600 mt-0.5 ml-5">{o.id}</p>
                        <div className="flex flex-wrap gap-1 mt-1 ml-5">
                          {o.cod_available && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">COD ✓</span>}
                          {o.returns_allowed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">Returns {o.returns_window}</span>}
                          {o.max_distance && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">📍 {o.max_distance} {o.distance_unit}</span>}
                          {o.timing_days.length < 7 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">{o.timing_days.join(', ')}</span>}
                        </div>
                      </div>
                      {o.price && <span className="shrink-0 text-xs font-bold" style={{ color: '#00b8e6' }}>₹{o.price} {o.currency}</span>}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6 pt-5 border-t border-white/[0.06]">
        <button onClick={() => step > 0 && setStep(s => s - 1)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
            ${step === 0 ? 'opacity-0 pointer-events-none' : 'text-slate-400 hover:text-white border border-white/[0.08] hover:border-white/20'}`}>
          <ChevronLeft size={15} /> Back
        </button>
        {step < 3 ? (
          <button onClick={() => setStep(s => s + 1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 shadow-lg"
            style={{ background: BRAND }}>
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all active:scale-95 shadow-lg"
            style={{ background: BRAND }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Publishing…</> : <><Upload size={14} /> Publish Catalog</>}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Messages ─────────────────────────────────────────────────────────────────

const ACTION_META = {
  select:     { color: '#00b8e6', bg: 'rgba(0,184,230,0.12)',  label: 'SELECT' },
  on_select:  { color: '#67e8f9', bg: 'rgba(103,232,249,0.1)', label: 'ON_SELECT' },
  init:       { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',label: 'INIT' },
  on_init:    { color: '#c4b5fd', bg: 'rgba(196,181,253,0.1)', label: 'ON_INIT' },
  confirm:    { color: '#34d399', bg: 'rgba(52,211,153,0.12)', label: 'CONFIRM' },
  on_confirm: { color: '#6ee7b7', bg: 'rgba(110,231,183,0.1)', label: 'ON_CONFIRM' },
}

function MessagesPage() {
  const [limit, setLimit]   = useState(50)
  const [filter, setFilter] = useState('')
  const [dirFilter, setDirFilter] = useState('ALL')
  const { data, loading, error, reload } = useApi(`/messages?limit=${limit}`, [limit])

  const items = (data?.items ?? []).filter(m => {
    const matchText = !filter || String(m.action).includes(filter.toLowerCase()) || String(m.transaction_id).includes(filter)
    const matchDir  = dirFilter === 'ALL' || m.direction === dirFilter
    return matchText && matchDir
  })

  const ackCount  = items.filter(m => m.ack_status?.ack_status === 'ACK'  || m.ack_status === 'ACK').length
  const nackCount = items.filter(m => m.ack_status?.ack_status === 'NACK' || m.ack_status === 'NACK').length

  return (
    <div>
      <PageHeader breadcrumb="Protocol Audit" title="Message Log"
        subtitle={`${items.length} recent protocol messages`}
        action={
          <button onClick={reload}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/[0.07]">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {/* Quick stats */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Card className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(0,184,230,0.15)' }}>📨</div>
            <div><p className="text-[11px] text-slate-500">Total</p><p className="text-lg font-bold text-white">{items.length}</p></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(16,185,129,0.15)' }}>✅</div>
            <div><p className="text-[11px] text-slate-500">ACK</p><p className="text-lg font-bold text-emerald-400">{ackCount}</p></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(239,68,68,0.15)' }}>❌</div>
            <div><p className="text-[11px] text-slate-500">NACK</p><p className="text-lg font-bold text-red-400">{nackCount}</p></div>
          </Card>
        </div>
      )}

      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter by action or txn ID…"
            className="w-full bg-slate-900 border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/40 transition-colors" />
        </div>
        <div className="flex gap-1 p-0.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {['ALL', 'INBOUND', 'OUTBOUND'].map(d => (
            <button key={d} onClick={() => setDirFilter(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dirFilter === d ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
              style={dirFilter === d ? { background: BRAND } : {}}>
              {d}
            </button>
          ))}
        </div>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}
          className="bg-slate-900 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/40 cursor-pointer">
          {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} rows</option>)}
        </select>
      </div>

      <Card>
        {loading ? <LoadingSpinner label="Loading messages…" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.06]">
                <th className="text-left px-5 py-3">Action</th>
                <th className="text-left px-5 py-3">Direction</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Txn ID</th>
                <th className="text-left px-5 py-3">URL</th>
                <th className="text-left px-5 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {items.map((m, idx) => {
                const meta = ACTION_META[m.action] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', label: m.action?.toUpperCase() }
                const ack  = m.ack_status?.ack_status || m.ack_status
                return (
                  <tr key={idx} className="hover:bg-white/[0.025] transition-colors">
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono"
                        style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`text-xs font-medium ${m.direction === 'INBOUND' ? 'text-cyan-400' : 'text-violet-400'}`}>
                        {m.direction === 'INBOUND' ? '↓ IN' : '↑ OUT'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5"><StatusBadge status={ack} /></td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-slate-500">
                      {m.transaction_id ? String(m.transaction_id).slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 max-w-[180px] truncate" title={m.url}>{m.url || '—'}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">{fmtDate(m.created_at?.Time || m.created_at)}</td>
                  </tr>
                )
              })}
              {!items.length && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No messages found</td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── OrderRatings (inline inside OrderDetailDrawer) ──────────────────────────

function OrderRatings({ contractId }) {
  const { data, loading } = useApi(contractId ? `/ratings?limit=20` : null, [contractId])
  const ratings = (data?.items || []).filter(r => r.contractId === contractId)
  if (loading) return null
  if (!ratings.length) return null
  return (
    <section>
      <SectionTitle>Customer Ratings ({ratings.length})</SectionTitle>
      <div className="space-y-2">
        {ratings.map(r => {
          let range = r.range
          try { if (typeof range === 'string') range = JSON.parse(range) } catch {}
          const score = range?.value ?? range?.score ?? '?'
          const max   = range?.max ?? 5
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  {Array.from({ length: max }, (_, i) => (
                    <Star key={i} size={12} className={i < score ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                  ))}
                  <span className="text-xs text-slate-400 ml-1">{score}/{max}</span>
                </div>
                <span className="text-[10px] text-slate-500">{fmtDate(r.createdAt)}</span>
              </div>
              <p className="text-[10px] text-slate-500">{r.bapId}</p>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

// ─── SupportPage ─────────────────────────────────────────────────────────────

function SupportPage() {
  const [page, setPage] = useState(1)
  const limit = 20
  const { data, loading, error, reload } = useApi(`/support-tickets?page=${page}&limit=${limit}`, [page])
  const items = data?.items || []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit) || 1

  const statusCls = {
    OPEN:     'bg-amber-500/15 text-amber-400 border border-amber-500/25',
    RESOLVED: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  }

  return (
    <div>
      <PageHeader title="Support Tickets" subtitle="Customer support requests received via Beckn protocol"
        action={<button onClick={reload} className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl text-slate-300 border border-white/10 hover:border-white/20 transition-all"><RefreshCw size={13} /> Refresh</button>} />

      {error && <ErrorBox message={error} onRetry={reload} />}

      <Card>
        {loading ? <LoadingSpinner label="Loading tickets…" /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Ticket ID', 'Order (Txn)', 'BAP', 'Description', 'Status', 'Created'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 font-mono text-slate-400">{t.id.slice(0,8)}…</td>
                  <td className="px-5 py-3 font-mono text-slate-400">{t.transactionId ? t.transactionId.slice(0,8) + '…' : '—'}</td>
                  <td className="px-5 py-3 text-slate-300 max-w-[140px] truncate">{t.bapId || '—'}</td>
                  <td className="px-5 py-3 text-slate-300 max-w-[200px] truncate">{t.name || t.shortDesc || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusCls[t.status] || 'bg-slate-500/15 text-slate-400'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmtDateShort(t.createdAt)}</td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No support tickets yet</td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onPage={setPage} total={total} limit={limit} />
      </Card>
    </div>
  )
}

// ─── RatingsPage ─────────────────────────────────────────────────────────────

function RatingsPage() {
  const [page, setPage] = useState(1)
  const limit = 20
  const { data, loading, error, reload } = useApi(`/ratings?page=${page}&limit=${limit}`, [page])
  const items = data?.items || []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div>
      <PageHeader title="Ratings" subtitle="Order ratings submitted by buyers"
        action={<button onClick={reload} className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl text-slate-300 border border-white/10 hover:border-white/20 transition-all"><RefreshCw size={13} /> Refresh</button>} />

      {error && <ErrorBox message={error} onRetry={reload} />}

      <Card>
        {loading ? <LoadingSpinner label="Loading ratings…" /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Order (Txn)', 'BAP', 'Target', 'Score', 'Date'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(r => {
                let range = r.range
                try { if (typeof range === 'string') range = JSON.parse(range) } catch {}
                const score = range?.value ?? range?.score ?? '?'
                const max   = range?.max ?? 5
                return (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 font-mono text-slate-400">{r.transactionId ? r.transactionId.slice(0,8) + '…' : '—'}</td>
                    <td className="px-5 py-3 text-slate-300 max-w-[140px] truncate">{r.bapId || '—'}</td>
                    <td className="px-5 py-3 text-slate-400 max-w-[120px] truncate">{r.targetId || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: max }, (_, i) => (
                          <Star key={i} size={11} className={i < score ? 'text-amber-400 fill-amber-400' : 'text-slate-700'} />
                        ))}
                        <span className="ml-1 text-slate-300 font-semibold">{score}/{max}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{fmtDateShort(r.createdAt)}</td>
                  </tr>
                )
              })}
              {!items.length && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No ratings yet</td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onPage={setPage} total={total} limit={limit} />
      </Card>
    </div>
  )
}

// ─── Catalog Management ───────────────────────────────────────────────────────

function CatalogsPage({ onNav }) {
  const [search, setSearch]         = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [page, setPage]             = useState(1)
  const [publishing, setPublishing] = useState(null)
  const limit = 20

  const url = `/catalogs?search=${encodeURIComponent(search)}&provider_id=${encodeURIComponent(providerFilter)}&page=${page}&limit=${limit}`
  const { data, loading, error, reload } = useApi(url, [search, providerFilter, page])
  const { data: provData } = useApi('/providers', [])

  const providers = provData?.items || []
  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const handlePublish = async (id) => {
    if (!window.confirm(`Publish catalog "${id}" to the network?`)) return
    setPublishing(id)
    try {
      await apiFetch(`/catalogs/${id}/publish`, { method: 'POST' })
      alert('Catalog published successfully!')
    } catch (e) {
      alert('Publish failed: ' + e.message)
    } finally {
      setPublishing(null)
    }
  }

  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString() : '—'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Catalogs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create catalogs, add products, and publish to the network</p>
        </div>
        <button onClick={() => onNav('create_catalog')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 active:scale-95"
          style={{ background: BRAND }}>
          <Plus size={15} /> Create Catalog
        </button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-52">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by name, ID or provider…"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 border border-white/[0.08] bg-slate-900 focus:outline-none focus:border-blue-500/50 transition-colors" />
          </div>
          <select value={providerFilter} onChange={e => { setProviderFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg text-sm text-white border border-white/[0.08] bg-slate-900 focus:outline-none focus:border-blue-500/50 transition-colors">
            <option value="">All Providers</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
          </select>
          <button onClick={reload} className="p-2 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? <LoadingSpinner /> : error ? <ErrorBox message={error} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Catalog', 'Provider', 'Products', 'Status', 'Validity', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(cat => (
                <tr key={cat.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{cat.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{cat.id}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{cat.providerId}</td>
                  <td className="px-4 py-3">
                    <span className="text-slate-300 text-xs">{cat.resourceCount} res · {cat.offerCount} offers</span>
                  </td>
                  <td className="px-4 py-3">
                    {cat.isPublished ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 w-fit">
                          <CheckCircle2 size={9} /> Published
                        </span>
                        <span className="text-[10px] text-slate-600">{fmtDate(cat.networkPublishedAt)}</span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 w-fit">
                        <Circle size={9} className="fill-amber-400" /> Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {cat.validityStart ? `${fmtDate(cat.validityStart)} – ${fmtDate(cat.validityEnd)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onNav('catalog_detail', { catalogId: cat.id })}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-white/[0.10] text-slate-300 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1">
                        <Eye size={11} /> View
                      </button>
                      <button onClick={() => onNav('add_product', { catalogId: cat.id })}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors flex items-center gap-1">
                        <Plus size={11} /> Product
                      </button>
                      <button onClick={() => handlePublish(cat.id)} disabled={publishing === cat.id}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-1 disabled:opacity-40">
                        {publishing === cat.id ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />} Publish
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No catalogs yet. <button onClick={() => onNav('create_catalog')} className="text-blue-400 hover:underline ml-1">Create one →</button>
                </td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onPage={setPage} total={total} limit={limit} />
      </Card>
    </div>
  )
}

// ─── Create Catalog Page ──────────────────────────────────────────────────────

const CATALOG_AUTOFILL_POOL = [
  { id: 'cat-outdoor-gear', name: 'Outdoor Gear Store', short_desc: 'Camping, hiking & adventure equipment',
    provider_id: 'provider-venky-bazaar', provider_name: 'Venky Bazaar' },
  { id: 'cat-indonesian-snacks', name: 'Toko Camilan Nusantara', short_desc: 'Authentic Indonesian biscuits, chips & sweets',
    provider_id: 'provider-toko-nusantara', provider_name: 'Toko Nusantara' },
  { id: 'cat-electronics', name: 'Tech Essentials Hub', short_desc: 'Gadgets, accessories and consumer electronics',
    provider_id: 'provider-techmart', provider_name: 'TechMart' },
  { id: 'cat-apparel', name: 'FashionForward Apparel', short_desc: 'Trendy clothing for men and women',
    provider_id: 'provider-fashionco', provider_name: 'FashionCo' },
]
let _catalogFillIdx = 0

function CreateCatalogPage({ onNav }) {
  const [form, setForm] = useState({
    id: '', name: '', short_desc: '',
    provider_id: '', provider_name: '',
    validity_start: '', validity_end: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const labelCls = 'block text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1'
  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 border border-white/[0.08] bg-slate-900 focus:outline-none focus:border-blue-500/50 transition-colors'

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAutoFill = () => {
    const seed   = CATALOG_AUTOFILL_POOL[_catalogFillIdx % CATALOG_AUTOFILL_POOL.length]
    _catalogFillIdx++
    const suffix = Date.now().toString(36)
    const now    = new Date()
    const start  = now.toISOString().slice(0,16)
    const end    = new Date(now.getTime() + 365*24*60*60*1000).toISOString().slice(0,16)
    setForm({ ...seed, id: `${seed.id}-${suffix}`, validity_start: start, validity_end: end })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id || !form.name || !form.provider_id || !form.provider_name) {
      setError('Catalog ID, Name, Provider ID and Provider Name are required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/catalogs', {
        method: 'POST',
        body: JSON.stringify({
          id: form.id,
          descriptor: { name: form.name, shortDesc: form.short_desc },
          provider: { id: form.provider_id, descriptor: { name: form.provider_name } },
          ...(form.validity_start && form.validity_end ? {
            validity: { startDate: new Date(form.validity_start).toISOString(), endDate: new Date(form.validity_end).toISOString() }
          } : {}),
        }),
      })
      onNav('catalog_detail', { catalogId: form.id })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => onNav('catalogs')} className="p-2 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white tracking-tight">Create Catalog</h1>
          <p className="text-sm text-slate-500 mt-0.5">Fill in the catalog details — add products after creation</p>
        </div>
        <button type="button" onClick={handleAutoFill}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors">
          <Wand2 size={13} /> Auto-fill Sample
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold pb-2 border-b border-white/[0.06]">Catalog Info</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Catalog ID *</label>
              <input className={inputCls} value={form.id} onChange={e => set('id', e.target.value)} placeholder="cat-outdoor-2026" required />
            </div>
            <div><label className={labelCls}>Catalog Name *</label>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Outdoor Gear 2026" required />
            </div>
            <div className="col-span-2"><label className={labelCls}>Short Description</label>
              <input className={inputCls} value={form.short_desc} onChange={e => set('short_desc', e.target.value)} placeholder="Camping and hiking gear for adventurers" />
            </div>
          </div>

          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold pb-2 border-b border-white/[0.06] mt-4">Provider</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Provider ID *</label>
              <input className={inputCls} value={form.provider_id} onChange={e => set('provider_id', e.target.value)} placeholder="provider-venky-bazaar" required />
            </div>
            <div><label className={labelCls}>Provider Name *</label>
              <input className={inputCls} value={form.provider_name} onChange={e => set('provider_name', e.target.value)} placeholder="Venky Bazaar" required />
            </div>
          </div>

          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold pb-2 border-b border-white/[0.06] mt-4">Validity (optional)</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Start Date</label>
              <input type="datetime-local" className={inputCls} value={form.validity_start} onChange={e => set('validity_start', e.target.value)} />
            </div>
            <div><label className={labelCls}>End Date</label>
              <input type="datetime-local" className={inputCls} value={form.validity_end} onChange={e => set('validity_end', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => onNav('catalogs')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/[0.10] text-slate-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              style={{ background: BRAND }}>
              {loading ? 'Creating…' : 'Create Catalog & Add Products →'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ─── Catalog Detail Page ──────────────────────────────────────────────────────

function CatalogDetailPage({ onNav, catalogId }) {
  const { data, loading, error, reload } = useApi(`/catalogs/${catalogId}`, [catalogId])
  const [publishing, setPublishing] = useState(false)

  const cat       = data?.catalog   || {}
  const resources = data?.resources || []
  const offers    = data?.offers    || []

  // Build a map from resource_id → offer for quick lookup
  const offerByResourceId = {}
  offers.forEach(o => {
    (o.resourceIds || []).forEach(rid => { offerByResourceId[rid] = o })
  })

  const handlePublish = async () => {
    if (!window.confirm('Publish this catalog to the Beckn network?')) return
    setPublishing(true)
    try {
      await apiFetch(`/catalogs/${catalogId}/publish`, { method: 'POST' })
      reload()
      alert('Published successfully!')
    } catch (e) {
      alert('Publish failed: ' + e.message)
    } finally {
      setPublishing(false)
    }
  }

  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString() : '—'

  const getPrice = (r) => {
    const o = offerByResourceId[r.id]
    if (!o) return '—'
    try {
      const ca = typeof o.considerationAttributes === 'string'
        ? JSON.parse(o.considerationAttributes)
        : o.considerationAttributes
      if (ca?.totalAmount !== undefined) return `${ca.currency || ''} ${ca.totalAmount}`.trim()
      if (ca?.breakup?.[0]?.amount !== undefined) return `${ca.breakup[0].amount}`
    } catch { /* ignore */ }
    return '—'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => onNav('catalogs')} className="p-2 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          {loading ? <div className="h-7 w-48 rounded bg-white/[0.06] animate-pulse" /> : (
            <>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">{cat.name || catalogId}</h1>
                {cat.isPublished ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400">
                    <CheckCircle2 size={10} /> Published
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400">
                    <Circle size={10} className="fill-amber-400" /> Draft
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{cat.id} · {cat.providerId}
                {cat.networkPublishedAt && <span className="ml-2 text-emerald-600">· Last published {fmtDate(cat.networkPublishedAt)}</span>}
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onNav('add_offer', { catalogId })}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-slate-500/30 text-slate-400 hover:bg-slate-500/10 transition-colors">
            <Tag size={14} /> Add Offer
          </button>
          <button onClick={() => onNav('add_product', { catalogId })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors">
            <Plus size={14} /> Add Product
          </button>
          <button onClick={handlePublish} disabled={publishing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ background: BRAND }}>
            {publishing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            {publishing ? 'Publishing…' : 'Publish to Network'}
          </button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {/* Catalog meta */}
      {!loading && cat.id && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">Provider</p>
            <p className="text-sm font-semibold text-slate-200">{cat.providerName || cat.providerId}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">Products</p>
            <p className="text-sm font-semibold text-slate-200">{resources.length} resources · {offers.length} offers</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">Validity</p>
            <p className="text-sm font-semibold text-slate-200">{cat.validityStart ? `${fmtDate(cat.validityStart)} – ${fmtDate(cat.validityEnd)}` : 'Not set'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">Network Status</p>
            {cat.isPublished ? (
              <div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400"><CheckCircle2 size={11} /> Published</span>
                <p className="text-[10px] text-slate-600 mt-0.5">{fmtDate(cat.networkPublishedAt)}</p>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400"><Circle size={11} className="fill-amber-400" /> Draft (never published)</span>
            )}
          </Card>
        </div>
      )}

      {/* Products table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-slate-200">Products</p>
          <div className="flex gap-2">
            <button onClick={reload} className="p-1.5 rounded-lg border border-white/[0.08] text-slate-500 hover:text-white transition-colors">
              <RefreshCw size={13} />
            </button>
            <button onClick={() => onNav('add_product', { catalogId })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105"
              style={{ background: BRAND }}>
              <Plus size={12} /> Add Product
            </button>
          </div>
        </div>
        {loading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Resource', 'Description', 'Price', 'Offer ID', 'Validity'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map(r => {
                const offer = offerByResourceId[r.id]
                return (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.mediaFiles && r.mediaFiles !== '[]' && r.mediaFiles !== 'null' && (() => {
                          try {
                            const mf = typeof r.mediaFiles === 'string' ? JSON.parse(r.mediaFiles) : r.mediaFiles
                            const url = Array.isArray(mf) ? mf[0]?.url : mf?.url
                            if (url) return <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" />
                          } catch { return null }
                          return null
                        })()}
                        <div>
                          <p className="font-semibold text-white">{r.name}</p>
                          <p className="text-[11px] font-mono text-slate-500">{r.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-48 truncate">{r.shortDesc || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400">{getPrice(r)}</td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-500">{offer?.id || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {offer?.validityStart ? `${fmtDate(offer.validityStart)} – ${fmtDate(offer.validityEnd)}` : '—'}
                    </td>
                  </tr>
                )
              })}
              {!resources.length && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No products yet.{' '}
                  <button onClick={() => onNav('add_product', { catalogId })} className="text-blue-400 hover:underline">Add the first product →</button>
                </td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Add Product Page ─────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

const PRODUCT_AUTOFILL_POOL = [
  { res: { id: 'item-keripik-singkong', name: 'Keripik Singkong Balado (Spicy Cassava Chips)', short_desc: 'Crispy cassava chips with balado seasoning', stock_quantity: '50', media_url: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400', brand: 'Chitato', origin_country: 'ID', weight_value: '150', weight_unit: 'G', color: 'Golden', material: 'Cassava' },
    off: { id: 'offer-keripik-singkong', name: 'Keripik Singkong Balado', price: '25000', currency: 'IDR', cod_available: true, returns_allowed: true, returns_window: 'P7D', returns_method: 'SELLER_PICKUP', cancel_allowed: true, cancel_window: 'PT2H', cancel_event: 'BEFORE_PACKING', replace_allowed: false, max_distance: '20', timing_days: ['MON','TUE','WED','THU','FRI','SAT','SUN'], timing_start: '09:00', timing_end: '21:00', offer_context: 'https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailOffer/v2.1/context.jsonld' } },
  { res: { id: 'item-bolu-pisang', name: 'Bolu Pisang Cokelat (Chocolate Banana Cake)', short_desc: 'Soft banana cake with chocolate chips', stock_quantity: '30', media_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400', brand: 'HomeMade', origin_country: 'ID', weight_value: '400', weight_unit: 'G', color: 'Brown', material: 'Flour' },
    off: { id: 'offer-bolu-pisang', name: 'Bolu Pisang Cokelat', price: '45000', currency: 'IDR', cod_available: true, returns_allowed: false, cancel_allowed: true, cancel_window: 'PT1H', cancel_event: 'BEFORE_PACKING', replace_allowed: false, max_distance: '10', timing_days: ['MON','TUE','WED','THU','FRI','SAT'], timing_start: '08:00', timing_end: '18:00', offer_context: 'https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailOffer/v2.1/context.jsonld' } },
  { res: { id: 'item-teh-botol', name: 'Teh Botol Sosro (Bottled Jasmine Tea)', short_desc: 'Ready-to-drink jasmine tea', stock_quantity: '200', media_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400', brand: 'Sosro', origin_country: 'ID', weight_value: '350', weight_unit: 'ML', color: 'Amber', material: 'PET Bottle' },
    off: { id: 'offer-teh-botol', name: 'Teh Botol Sosro', price: '5000', currency: 'IDR', cod_available: true, returns_allowed: false, cancel_allowed: true, cancel_window: 'PT30M', cancel_event: 'BEFORE_PACKING', replace_allowed: false, max_distance: '15', timing_days: ['MON','TUE','WED','THU','FRI','SAT','SUN'], timing_start: '07:00', timing_end: '22:00', offer_context: 'https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailOffer/v2.1/context.jsonld' } },
]
let _productFillIdx = 0

// ── Shared offer form component ────────────────────────────────────────────

function OfferForm({ off, oSet, offOpen, setOffOpen, catalogId, showResourcePicker }) {
  const labelCls = 'block text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1'
  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 border border-white/[0.08] bg-slate-900 focus:outline-none focus:border-blue-500/50 transition-colors'

  const { data: catResData } = useApi(showResourcePicker ? `/catalogs/${catalogId}/resources` : null, [catalogId, showResourcePicker])
  const existingResources = catResData?.items || []

  return (
    <>
      {/* Resource picker for offer-only mode */}
      {showResourcePicker && existingResources.length > 0 && (
        <div className="mb-4">
          <label className={labelCls}>Link to Resource(s) *</label>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {existingResources.map(r => (
              <label key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06] hover:bg-slate-800 cursor-pointer">
                <input type="checkbox" className="accent-blue-500"
                  checked={off.resource_ids.split(',').map(s => s.trim()).includes(r.id)}
                  onChange={e => {
                    const cur = off.resource_ids.split(',').map(s => s.trim()).filter(Boolean)
                    const next = e.target.checked ? [...cur, r.id] : cur.filter(x => x !== r.id)
                    oSet('resource_ids', next.join(', '))
                  }} />
                <span className="text-xs text-slate-300 flex-1">{r.name}</span>
                <span className="text-[10px] font-mono text-slate-600">{r.id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>Offer ID *</label>
          <input className={inputCls} value={off.id} onChange={e => oSet('id', e.target.value)} placeholder="offer-flask-mh500" required />
        </div>
        <div><label className={labelCls}>Offer Name *</label>
          <input className={inputCls} value={off.name} onChange={e => oSet('name', e.target.value)} placeholder="Flask 500ml Yellow" required />
        </div>
        {!showResourcePicker && (
          <div className="col-span-full"><label className={labelCls}>Resource IDs <span className="text-slate-600 font-normal">(comma-separated; leave blank to auto-link)</span></label>
            <input className={inputCls} value={off.resource_ids} onChange={e => oSet('resource_ids', e.target.value)} placeholder="item-flask-mh500" />
          </div>
        )}
        <div><label className={labelCls}>Price</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={off.price} onChange={e => oSet('price', e.target.value)} placeholder="499" />
        </div>
        <div><label className={labelCls}>Currency</label>
          <select className={inputCls} value={off.currency} onChange={e => oSet('currency', e.target.value)}>
            {['INR','USD','EUR','SGD','MYR','IDR'].map(c => <option key={c} className="bg-slate-900">{c}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Validity Start</label>
          <input type="datetime-local" className={inputCls} value={off.validity_start} onChange={e => oSet('validity_start', e.target.value)} />
        </div>
        <div><label className={labelCls}>Validity End</label>
          <input type="datetime-local" className={inputCls} value={off.validity_end} onChange={e => oSet('validity_end', e.target.value)} />
        </div>
        <div><label className={labelCls}>Short Description</label>
          <input className={inputCls} value={off.short_desc} onChange={e => oSet('short_desc', e.target.value)} placeholder="Best seller flask" />
        </div>
      </div>

      {/* Policies collapsible */}
      <button type="button" onClick={() => setOffOpen(s => ({ ...s, pol: !s.pol }))}
        className="mt-4 w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors pt-3 border-t border-white/[0.06]">
        <span>📋 Policies &amp; Serviceability</span>
        <ChevronRightIcon size={13} className={`transition-transform ${offOpen.pol ? 'rotate-90' : ''}`} />
      </button>
      {offOpen.pol && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Returns */}
            <div className="p-3 rounded-lg bg-slate-800/50 border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300">Returns</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-slate-500">Allowed</span>
                  <input type="checkbox" checked={off.returns_allowed} onChange={e => oSet('returns_allowed', e.target.checked)} className="accent-blue-500" />
                </label>
              </div>
              {off.returns_allowed && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>Window</label>
                    <input className={inputCls} value={off.returns_window} onChange={e => oSet('returns_window', e.target.value)} placeholder="P7D" />
                  </div>
                  <div><label className={labelCls}>Method</label>
                    <select className={inputCls} value={off.returns_method} onChange={e => oSet('returns_method', e.target.value)}>
                      {['SELLER_PICKUP','BUYER_RETURN','DROP_AT_STORE'].map(m => <option key={m} className="bg-slate-900">{m}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
            {/* Cancellation */}
            <div className="p-3 rounded-lg bg-slate-800/50 border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300">Cancellation</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-slate-500">Allowed</span>
                  <input type="checkbox" checked={off.cancel_allowed} onChange={e => oSet('cancel_allowed', e.target.checked)} className="accent-blue-500" />
                </label>
              </div>
              {off.cancel_allowed && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>Window</label>
                    <input className={inputCls} value={off.cancel_window} onChange={e => oSet('cancel_window', e.target.value)} placeholder="PT2H" />
                  </div>
                  <div><label className={labelCls}>Cutoff</label>
                    <select className={inputCls} value={off.cancel_event} onChange={e => oSet('cancel_event', e.target.value)}>
                      {['BEFORE_PACKING','BEFORE_SHIPPING','BEFORE_DELIVERY'].map(ev => <option key={ev} className="bg-slate-900">{ev}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* COD + distance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-white/[0.06]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={off.cod_available} onChange={e => oSet('cod_available', e.target.checked)} className="accent-blue-500" />
                <span className="text-xs font-semibold text-slate-300">Cash on Delivery (COD)</span>
              </label>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-white/[0.06] space-y-2">
              <p className="text-xs font-semibold text-slate-300">Delivery Radius</p>
              <div className="flex gap-2">
                <input className={inputCls} type="number" value={off.max_distance} onChange={e => oSet('max_distance', e.target.value)} placeholder="15" />
                <select className={`${inputCls} w-20 shrink-0`} value={off.distance_unit} onChange={e => oSet('distance_unit', e.target.value)}>
                  {['KM','MI'].map(u => <option key={u} className="bg-slate-900">{u}</option>)}
                </select>
              </div>
            </div>
          </div>
          {/* Timing */}
          <div className="p-3 rounded-lg bg-slate-800/50 border border-white/[0.06] space-y-3">
            <p className="text-xs font-semibold text-slate-300">Operating Hours</p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map(d => (
                <button key={d} type="button"
                  onClick={() => oSet('timing_days', off.timing_days.includes(d) ? off.timing_days.filter(x => x !== d) : [...off.timing_days, d])}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors ${off.timing_days.includes(d) ? 'text-white' : 'border border-white/[0.10] text-slate-500 hover:text-white'}`}
                  style={off.timing_days.includes(d) ? { background: BRAND } : {}}>
                  {d}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Opens</label>
                <input type="time" className={inputCls} value={off.timing_start} onChange={e => oSet('timing_start', e.target.value)} />
              </div>
              <div><label className={labelCls}>Closes</label>
                <input type="time" className={inputCls} value={off.timing_end} onChange={e => oSet('timing_end', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Add Product Page (resource only) ──────────────────────────────────────

function AddProductPage({ onNav, catalogId }) {
  const labelCls = 'block text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1'
  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 border border-white/[0.08] bg-slate-900 focus:outline-none focus:border-blue-500/50 transition-colors'

  const [res, setRes]         = useState(EMPTY_RESOURCE())
  const [resOpen, setResOpen] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [success, setSuccess] = useState(false)

  const rSet = (k, v) => setRes(r => ({ ...r, [k]: v }))

  const handleAutoFill = () => {
    const seed   = PRODUCT_AUTOFILL_POOL[_productFillIdx % PRODUCT_AUTOFILL_POOL.length]
    _productFillIdx++
    const uid = id => `${id}-${Date.now().toString(36)}`
    setRes({ ...EMPTY_RESOURCE(), ...seed.res, id: uid(seed.res.id) })
    setResOpen({}); setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!res.id || !res.name) { setError('Resource ID and Name are required.'); return }
    setLoading(true); setError(null)

    const resourceAttrs = buildResourceAttrs(res)
    const mediaFile = res.media_url ? [{ uri: res.media_url, mimeType: 'image/jpeg' }] : []

    // We use /products but with a minimal auto-generated placeholder offer so backend accepts it
    const offerId = `offer-${res.id}`
    try {
      await apiFetch(`/catalogs/${catalogId}/products`, {
        method: 'POST',
        body: JSON.stringify({
          resource: {
            id: res.id,
            descriptor: { name: res.name, shortDesc: res.short_desc, longDesc: res.long_desc, mediaFile },
            stockQuantity: res.stock_quantity ? Number(res.stock_quantity) : 0,
            ...(resourceAttrs ? { resourceAttributes: resourceAttrs } : {}),
          },
          offer: {
            id: offerId,
            descriptor: { name: res.name },
            resourceIds: [res.id],
          },
        }),
      })
      setSuccess(true)
      setTimeout(() => onNav('add_offer', { catalogId, preselectedResourceId: res.id }), 1000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <CheckCircle2 size={48} className="text-emerald-400" />
        <p className="text-white text-lg font-semibold">Resource added!</p>
        <p className="text-slate-500 text-sm">Opening offer setup…</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => onNav('catalog_detail', { catalogId })} className="p-2 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white tracking-tight">Add Product</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">catalog: {catalogId}</p>
        </div>
        <button type="button" onClick={handleAutoFill}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors">
          <Wand2 size={13} /> Auto-fill
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-4 sm:p-6">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold pb-3 border-b border-white/[0.06] mb-4">📦 Resource Details</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelCls}>Resource ID *</label>
              <input className={inputCls} value={res.id} onChange={e => rSet('id', e.target.value)} placeholder="item-flask-mh500" required />
            </div>
            <div><label className={labelCls}>Name *</label>
              <input className={inputCls} value={res.name} onChange={e => rSet('name', e.target.value)} placeholder="Stainless Steel Hiking Flask" required />
            </div>
            <div><label className={labelCls}>Short Description</label>
              <input className={inputCls} value={res.short_desc} onChange={e => rSet('short_desc', e.target.value)} placeholder="500ml insulated flask" />
            </div>
            <div><label className={labelCls}>Long Description</label>
              <input className={inputCls} value={res.long_desc} onChange={e => rSet('long_desc', e.target.value)} placeholder="Full description…" />
            </div>
            <div><label className={labelCls}>Stock Quantity <span className="text-slate-600 font-normal">(blank = unlimited)</span></label>
              <input className={inputCls} type="number" min="0" value={res.stock_quantity} onChange={e => rSet('stock_quantity', e.target.value)} placeholder="50" />
            </div>
            <div><label className={labelCls}>Image URL</label>
              <input className={inputCls} value={res.media_url} onChange={e => rSet('media_url', e.target.value)} placeholder="https://example.com/product.jpg" />
            </div>
          </div>

          {/* Identity & Physical */}
          <button type="button" onClick={() => setResOpen(s => ({ ...s, phys: !s.phys }))}
            className="mt-4 w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors pt-3 border-t border-white/[0.06]">
            <span>🏷️ Identity &amp; Physical Attributes</span>
            <ChevronRightIcon size={13} className={`transition-transform ${resOpen.phys ? 'rotate-90' : ''}`} />
          </button>
          {resOpen.phys && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelCls}>Brand</label>
                  <input className={inputCls} value={res.brand} onChange={e => rSet('brand', e.target.value)} placeholder="InstaCuppa" />
                </div>
                <div><label className={labelCls}>Origin Country</label>
                  <input className={inputCls} value={res.origin_country} onChange={e => rSet('origin_country', e.target.value)} placeholder="IN" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-1 sm:col-span-2"><label className={labelCls}>Weight</label>
                  <input className={inputCls} type="number" value={res.weight_value} onChange={e => rSet('weight_value', e.target.value)} placeholder="350" />
                </div>
                <div className="col-span-1 sm:col-span-2"><label className={labelCls}>Unit</label>
                  <select className={inputCls} value={res.weight_unit} onChange={e => rSet('weight_unit', e.target.value)}>
                    {['G','KG','MG','OZ','LB'].map(u => <option key={u} className="bg-slate-900">{u}</option>)}
                  </select>
                </div>
                <div className="col-span-1 sm:col-span-2"><label className={labelCls}>Volume</label>
                  <input className={inputCls} type="number" value={res.volume_value} onChange={e => rSet('volume_value', e.target.value)} placeholder="500" />
                </div>
                <div className="col-span-1 sm:col-span-2"><label className={labelCls}>Unit</label>
                  <select className={inputCls} value={res.volume_unit} onChange={e => rSet('volume_unit', e.target.value)}>
                    {['ML','L','FL_OZ'].map(u => <option key={u} className="bg-slate-900">{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelCls}>Color</label><input className={inputCls} value={res.color} onChange={e => rSet('color', e.target.value)} placeholder="Yellow" /></div>
                <div><label className={labelCls}>Material</label><input className={inputCls} value={res.material} onChange={e => rSet('material', e.target.value)} placeholder="Steel" /></div>
                <div><label className={labelCls}>Finish</label><input className={inputCls} value={res.finish} onChange={e => rSet('finish', e.target.value)} placeholder="Matte" /></div>
              </div>
            </div>
          )}

          {/* Packaged Goods */}
          <button type="button" onClick={() => setResOpen(s => ({ ...s, pkg: !s.pkg }))}
            className="mt-4 w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors pt-3 border-t border-white/[0.06]">
            <span>📦 Packaged Goods Declaration</span>
            <ChevronRightIcon size={13} className={`transition-transform ${resOpen.pkg ? 'rotate-90' : ''}`} />
          </button>
          {resOpen.pkg && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Manufacturer Type</label>
                <select className={inputCls} value={res.mfr_type} onChange={e => rSet('mfr_type', e.target.value)}>
                  {['MANUFACTURER','PACKER','IMPORTER'].map(t => <option key={t} className="bg-slate-900">{t}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Manufacturer Name</label>
                <input className={inputCls} value={res.mfr_name} onChange={e => rSet('mfr_name', e.target.value)} placeholder="Company Ltd" />
              </div>
              <div className="col-span-full"><label className={labelCls}>Manufacturer Address</label>
                <input className={inputCls} value={res.mfr_address} onChange={e => rSet('mfr_address', e.target.value)} placeholder="City, State, Country" />
              </div>
              <div><label className={labelCls}>Common / Generic Name</label>
                <input className={inputCls} value={res.common_name} onChange={e => rSet('common_name', e.target.value)} placeholder="Vacuum Flask" />
              </div>
              <div><label className={labelCls}>Net Quantity</label>
                <div className="flex gap-2">
                  <input className={inputCls} type="number" value={res.net_qty_value} onChange={e => rSet('net_qty_value', e.target.value)} placeholder="500" />
                  <select className={`${inputCls} w-24 shrink-0`} value={res.net_qty_unit} onChange={e => rSet('net_qty_unit', e.target.value)}>
                    {['ML','L','G','KG','PCS'].map(u => <option key={u} className="bg-slate-900">{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => onNav('catalog_detail', { catalogId })}
            className="px-5 py-3 rounded-xl text-sm font-semibold border border-white/[0.10] text-slate-400 hover:text-white transition-colors text-center">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: BRAND }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : <><Plus size={14} /> Save Resource → Setup Offer</>}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Add Offer Page (standalone) ───────────────────────────────────────────

function AddOfferPage({ onNav, catalogId, preselectedResourceId }) {
  const [off, setOff]         = useState(() => ({
    ...EMPTY_OFFER(),
    resource_ids: preselectedResourceId || '',
  }))
  const [offOpen, setOffOpen] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [success, setSuccess] = useState(false)

  const oSet = (k, v) => setOff(o => ({ ...o, [k]: v }))

  const handleAutoFill = () => {
    const seed = PRODUCT_AUTOFILL_POOL[_productFillIdx % PRODUCT_AUTOFILL_POOL.length]
    _productFillIdx++
    const uid = id => `${id}-${Date.now().toString(36)}`
    setOff({ ...EMPTY_OFFER(), ...seed.off, id: uid(seed.off.id),
      resource_ids: preselectedResourceId || '' })
    setOffOpen({}); setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!off.id || !off.name) { setError('Offer ID and Name are required.'); return }
    setLoading(true); setError(null)

    const offerAttrs = buildOfferAttrs(off)
    const resourceIds = off.resource_ids.split(',').map(s => s.trim()).filter(Boolean)

    const payload = {
      id: off.id,
      descriptor: { name: off.name, shortDesc: off.short_desc },
      resourceIds,
      ...(off.validity_start && off.validity_end ? {
        validity: { startDate: new Date(off.validity_start).toISOString(), endDate: new Date(off.validity_end).toISOString() }
      } : {}),
      ...(offerAttrs ? { offerAttributes: offerAttrs } : {}),
      ...(off.price ? {
        considerations: [{
          id: `${off.id}-price`,
          status: { code: 'ACTIVE', name: 'ACTIVE' },
          considerationAttributes: {
            '@context': 'https://schema.beckn.io/RetailConsideration/v2.1/context.jsonld',
            '@type': 'RetailConsideration',
            currency: off.currency,
            breakup: [{ title: off.name || off.id, amount: Number(off.price), type: 'BASE_PRICE' }],
            totalAmount: Number(off.price),
            paymentMethods: off.cod_available ? ['PREPAID', 'COD', 'UPI'] : ['PREPAID', 'UPI'],
          },
        }],
      } : {}),
    }

    try {
      await apiFetch(`/catalogs/${catalogId}/offers`, { method: 'POST', body: JSON.stringify(payload) })
      setSuccess(true)
      setTimeout(() => onNav('catalog_detail', { catalogId }), 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <CheckCircle2 size={48} className="text-emerald-400" />
        <p className="text-white text-lg font-semibold">Offer added!</p>
        <p className="text-slate-500 text-sm">Redirecting to catalog…</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => onNav('catalog_detail', { catalogId })} className="p-2 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white tracking-tight">Add Offer</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">catalog: {catalogId}</p>
        </div>
        <button type="button" onClick={handleAutoFill}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors">
          <Wand2 size={13} /> Auto-fill
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-4 sm:p-6">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold pb-3 border-b border-white/[0.06] mb-4">🏷️ Offer Details</p>
          <OfferForm off={off} oSet={oSet} offOpen={offOpen} setOffOpen={setOffOpen}
            catalogId={catalogId} showResourcePicker={!preselectedResourceId} />
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => onNav('catalog_detail', { catalogId })}
            className="px-5 py-3 rounded-xl text-sm font-semibold border border-white/[0.10] text-slate-400 hover:text-white transition-colors text-center">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: BRAND }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Adding…</> : <><Tag size={14} /> Add Offer to Catalog</>}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── App shell ────────────────────────────────────────────────────────────────

const PAGES = {
  overview:       OverviewPage,
  orders:         OrdersPage,
  inventory:      InventoryPage,
  catalogs:       CatalogsPage,
  create_catalog: CreateCatalogPage,
  catalog_detail: CatalogDetailPage,
  add_product:    AddProductPage,
  add_offer:      AddOfferPage,
  publish:        PublishPage,
  messages:       MessagesPage,
  support:        SupportPage,
  ratings:        RatingsPage,
}

export default function App() {
  const [page, setPage]       = useState('overview')
  const [navExtra, setNavExtra] = useState({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const Page = PAGES[page] || OverviewPage

  const onNav = (target, extra = {}) => { setPage(target); setNavExtra(extra); setSidebarOpen(false) }

  return (
    <div className="flex min-h-screen" style={{ background: '#080d1e' }}>
      <Sidebar active={page} onNav={onNav} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 lg:ml-64 min-h-screen overflow-y-auto">
        <div className="bg-orange-500 text-white text-xs sm:text-sm text-center py-1.5 px-4">
          This is the seller (bpp) reference app for ION network managed by remiges technologies pvt. ltd.
        </div>

        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]"
          style={{ background: '#0a0e1a' }}>
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-400 hover:text-white transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-white">BPP Admin</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-auto" />
        </div>

        <div className="p-4 sm:p-6 lg:p-9">
          <AnimatePresence mode="wait">
            <motion.div key={page}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}>
              <Page onNav={onNav} {...navExtra} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
