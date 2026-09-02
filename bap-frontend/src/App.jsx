import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, Search, X, Package, CheckCircle2, Loader2,
  ArrowRight, ChevronRight, Minus, Plus, Sparkles, Tag,
  RotateCcw, CreditCard, ShieldCheck, Clock,
  Star, Info, Receipt, Store, MapPin, Calendar, Zap,
  User, Phone, Home, ChevronLeft, Banknote,
  Ban, MessageSquare, RefreshCw, ThumbsUp,
  History, Wand2, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';

// BPP target, network ID, and BAP identity are all server-side config (BAP .env).
// The frontend only needs the API base path.
const API_BASE = '/api/v1';

/* ─────────────────────────── helpers ────────────────────────────────────── */

function parseCatalogs(data) {
  // Use a Map keyed by "bppId::resourceId" so that duplicate resources from
  // overlapping discover results (re-indexing, multiple catalogs from the same
  // BPP) are deduplicated. Last-write wins, which is fine — they're identical.
  const seen = new Map();

  (data?.message?.catalogs || []).forEach(cat => {
    (cat.resources || []).forEach(res => {
      if (!res?.id) return; // skip malformed entries

      // Find the offer that covers this resource. A resource can have more than
      // one matching offer — e.g. bpp-frontend's "Add Product" step creates an
      // empty placeholder offer (no price) alongside the resource, then a real
      // priced offer gets added afterward via "Add Offer". Prefer whichever
      // matching offer actually carries price data over the first one found.
      const offerHasPrice = o =>
        (o.considerations?.[0]?.considerationAttributes?.totalAmount != null) ||
        (o.offerAttributes?.price?.value != null);
      const matchingOffers = (cat.offers || []).filter(o => o.resourceIds?.includes(res.id));
      const offer = matchingOffers.find(offerHasPrice) || matchingOffers[0] || null;

      // Resources with no offer have no price — skip them to avoid blank cards.
      if (!offer) return;

      const oa    = offer.offerAttributes || {};
      const pa    = oa.price || {};
      const cons  = offer.considerations?.[0]?.considerationAttributes || {};

      // Price: prefer considerations.totalAmount, fallback to offerAttributes.price.value
      let price    = cons.totalAmount ?? pa.value ?? 0;
      let currency = cons.currency || pa.currency || 'INR';

      // Price breakup: prefer considerations.breakup, build from price.components if needed
      let breakup = cons.breakup || [];
      if (!breakup.length && pa.value) {
        breakup = [{ title: res.descriptor?.name || 'Item price', amount: pa.value, type: 'BASE_PRICE' }];
        if (pa.components?.length) {
          pa.components.forEach(c => {
            if (c.type === 'DISCOUNT') {
              breakup.push({ title: `Discount (${c.value}%)`, amount: -(pa.value * c.value / 100), type: 'DISCOUNT' });
            }
          });
          const discountAmt = pa.components.filter(c=>c.type==='DISCOUNT').reduce((s,c)=>s+(pa.value*c.value/100),0);
          price = pa.value - discountAmt;
        }
      }

      // Seller / provider
      const provider      = offer.provider || {};
      const sellerName    = provider.descriptor?.name || '';
      const sellerAddress = provider.availableAt?.[0]?.address;

      // Policies
      const policies      = oa.policies || {};
      const serviceability= oa.serviceability || {};
      const timing        = serviceability.timing?.[0] || {};
      const distance      = serviceability.distanceConstraint || {};

      // Composite dedup key: bpp + resource so cross-BPP resources with
      // the same resource ID (unlikely but possible) are treated as distinct.
      const bppId  = cat.bppId  || '';
      const bppUri = cat.bppUri || '';
      const dedupKey = `${bppId}::${res.id}`;

      seen.set(dedupKey, {
        id: res.id,
        name: res.descriptor?.name || 'Unknown Product',
        shortDesc: res.descriptor?.shortDesc || '',
        longDesc: res.descriptor?.longDesc || '',
        category: cat.descriptor?.name || 'Retail',
        price,
        currency,
        image: res.descriptor?.mediaFile?.[0]?.uri ||
          'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=70',
        offerId:      offer.id || '',
        offerName:    offer.descriptor?.name || offer.descriptor?.shortDesc || '',
        providerId:   provider.id || '',
        sellerName,
        bppId,
        bppUri,
        offerAttr:    oa,
        breakup,
        sellerAddress,
        returnPolicy:   policies.returns,
        cancelPolicy:   policies.cancellation,
        codAvailable:   oa.paymentConstraints?.codAvailable,
        deliveryRange:  distance.maxDistance ? `${distance.maxDistance} ${distance.unit || 'KM'}` : '',
        deliveryDays:   timing.daysOfWeek || [],
        deliveryHours:  timing.timeRange ? `${timing.timeRange.start}–${timing.timeRange.end}` : '',
        offerValidity:  offer.validity?.endDate ? new Date(offer.validity.endDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '',
      });
    });
  });

  return Array.from(seen.values());
}

// Parse the on_select contract from status polling to get the BPP-confirmed quote
function parseOnSelectContract(contract) {
  if (!contract) return null;
  const consideration = contract.consideration?.[0] ?? contract.considerations?.[0];
  const commitment    = contract.commitments?.[0];
  const ca  = consideration?.considerationAttributes || {};
  const pol = commitment?.offer?.offerAttributes?.policies || {};
  return {
    total:          ca.totalAmount,
    currency:       ca.currency || 'INR',
    breakup:        ca.breakup || [],
    paymentMethods: ca.paymentMethods || [],
    codAvailable:   commitment?.offer?.offerAttributes?.paymentConstraints?.codAvailable,
    seller:         commitment?.offer?.provider?.descriptor?.name,
    offerName:      commitment?.offer?.descriptor?.name,
    returnPolicy:   pol.returns,
    cancelPolicy:   pol.cancellation,
  };
}

const fmt = (amount, currency = 'INR') => {
  if (!amount && amount !== 0) return '—';
  const sym = currency === 'IDR' ? 'Rp' : '₹';
  return `${sym}${Number(amount).toLocaleString()}`;
};

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=70';

/* ─────────────────────────── SkeletonCard ───────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="skeleton h-44 w-full" />
      <div className="p-4 space-y-2.5">
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-3 w-2/3" />
        <div className="flex justify-between items-center pt-2">
          <div className="skeleton h-6 w-16" />
          <div className="skeleton h-9 w-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── OfferInfoPanel ─────────────────────────────── */
// Shows catalog offer details: price breakdown, seller, policies, serviceability
function OfferInfoPanel({ product }) {
  const { breakup, currency, price, sellerName, sellerAddress,
          returnPolicy, cancelPolicy, codAvailable,
          deliveryRange, deliveryHours, deliveryDays, offerName, offerValidity } = product;

  const shortAddr = sellerAddress
    ? [sellerAddress.streetAddress, sellerAddress.addressLocality, sellerAddress.addressRegion].filter(Boolean).join(', ')
    : '';

  return (
    <div className="space-y-3">
      {/* Price section */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.07] flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            {offerName || 'Pricing'}
          </span>
          {offerValidity && (
            <span className="ml-auto text-[10px] text-slate-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Valid till {offerValidity}
            </span>
          )}
        </div>
        <div className="px-4 py-3 space-y-1.5">
          {breakup.length > 0 ? (
            <>
              {breakup.map((b, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-400">{b.title}</span>
                  <span className={
                    b.type === 'DISCOUNT' ? 'text-emerald-400 font-medium' :
                    b.type === 'TAX'      ? 'text-amber-400' : 'text-slate-200'
                  }>
                    {b.type === 'DISCOUNT' && b.amount < 0 ? '−' : ''}{fmt(Math.abs(b.amount), currency)}
                  </span>
                </div>
              ))}
              <div className="border-t border-white/10 pt-2 mt-1 flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-300">Total</span>
                <span className="text-xl font-bold text-emerald-300">{fmt(price, currency)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Price</span>
              <span className="text-xl font-bold text-emerald-300">{fmt(price, currency)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Seller */}
      {sellerName && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03]">
          <Store className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-200">{sellerName}</p>
            {shortAddr && <p className="text-xs text-slate-500 mt-0.5">{shortAddr}</p>}
          </div>
        </div>
      )}

      {/* Delivery & badges */}
      <div className="flex flex-wrap gap-2">
        {deliveryRange && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full">
            <MapPin className="w-3 h-3" /> Delivers within {deliveryRange}
          </span>
        )}
        {deliveryHours && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10 px-2.5 py-1 rounded-full">
            <Clock className="w-3 h-3" /> {deliveryHours}
          </span>
        )}
        {codAvailable && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full">
            <CreditCard className="w-3 h-3" /> Cash on Delivery
          </span>
        )}
        {returnPolicy?.allowed && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-full">
            <RotateCcw className="w-3 h-3" /> {returnPolicy.window?.replace('P','').replace('D',' day')} returns
          </span>
        )}
        {cancelPolicy?.allowed && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-full">
            <X className="w-3 h-3" /> Free cancellation
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── ConfirmedQuotePanel ────────────────────────── */
// Shows the BPP-confirmed quote from on_select (may differ from catalog price)
function ConfirmedQuotePanel({ quote, onInit, isLoading }) {
  if (!quote) return null;
  const { total, currency, breakup, paymentMethods, codAvailable,
          seller, returnPolicy, cancelPolicy } = quote;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/15">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Confirmed Quote</span>
        {seller && <span className="ml-auto text-[10px] text-slate-400 flex items-center gap-1"><Store className="w-3 h-3" />{seller}</span>}
      </div>
      <div className="px-4 py-3 space-y-2">
        {breakup.length > 0 && (
          <div className="space-y-1.5">
            {breakup.map((b, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-400">{b.title}</span>
                <span className={b.type === 'TAX' ? 'text-amber-400' : b.type === 'DISCOUNT' ? 'text-emerald-400' : 'text-slate-200'}>
                  {fmt(b.amount, currency)}
                </span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
              <span className="text-slate-200">Total</span>
              <span className="text-emerald-300 text-lg">{fmt(total, currency)}</span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {codAvailable && <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">COD</span>}
          {paymentMethods?.map(m => <span key={m} className="text-[10px] bg-white/5 text-slate-400 border border-white/10 px-2 py-0.5 rounded-full">{m}</span>)}
          {returnPolicy?.allowed && <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">↩ {returnPolicy.window} returns</span>}
        </div>
        <button
          onClick={onInit} disabled={isLoading}
          className="w-full mt-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/30"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Initialize Order</span><ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── ProductModal ───────────────────────────────── */
function ProductModal({ product, transaction, onClose, onSelect, onInit, onConfirm, isLoading }) {
  const isThisProduct = transaction?.product?.id === product.id;
  const status        = isThisProduct ? transaction.status : null;

  // Parse confirmed on_select contract once QUOTE_RECEIVED
  const confirmedQuote = (status === 'QUOTE_RECEIVED' && transaction?.contract)
    ? parseOnSelectContract(
        typeof transaction.contract === 'string'
          ? JSON.parse(transaction.contract)
          : transaction.contract
      )
    : null;

  const pendingStatuses = ['SELECT_SENT', 'INIT_SENT', 'CONFIRM_SENT'];
  const isPending = pendingStatuses.includes(status);

  const pendingLabel = {
    SELECT_SENT:  'Requesting quote from BPP…',
    INIT_SENT:    'Initializing order…',
    CONFIRM_SENT: 'Confirming your order…',
  }[status];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full max-w-lg glass rounded-3xl overflow-hidden max-h-[94vh] flex flex-col"
      >
        {/* ── Hero image ─────────────────────────────────────────────── */}
        <div className="relative h-52 shrink-0 bg-slate-800/80 overflow-hidden">
          <img src={product.image} alt={product.name}
            className="w-full h-full object-cover opacity-90"
            onError={e => { e.target.src = FALLBACK_IMG; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10" />
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur text-white hover:bg-black/70 transition-colors z-10">
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest bg-black/50 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full backdrop-blur">
              <Tag className="inline w-2.5 h-2.5 mr-1 -mt-0.5" />{product.category}
            </span>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-grow px-5 py-4 space-y-4">

          {/* Product name & description */}
          <div>
            <h2 className="text-xl leading-snug">{product.name}</h2>
            {product.shortDesc && (
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{product.shortDesc}</p>
            )}
            {product.longDesc && product.longDesc !== product.shortDesc && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{product.longDesc}</p>
            )}
          </div>

          {/* ── Offer info from catalog (always shown) ───────────────── */}
          <OfferInfoPanel product={product} />

          {/* ── Action area ─────────────────────────────────────────── */}

          {/* No transaction yet — show Select button */}
          {!status && (
            <button onClick={() => onSelect(product)} disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/30">
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending select…</>
                : <><Zap className="w-4 h-4" /> Select &amp; Confirm Quote</>}
            </button>
          )}

          {/* Waiting for async response */}
          {isPending && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
              <div>
                <p className="text-sm text-slate-300">{pendingLabel}</p>
                <p className="text-xs text-slate-500 mt-0.5">Txn {transaction.id.slice(0, 8)}…</p>
              </div>
            </div>
          )}

          {/* on_select confirmed quote */}
          {status === 'QUOTE_RECEIVED' && (
            <ConfirmedQuotePanel quote={confirmedQuote} onInit={onInit} isLoading={isLoading} />
          )}

          {/* Init received — confirm */}
          {status === 'INIT_RECEIVED' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-300 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                Order initialized. Click below to place &amp; pay.
              </div>
              <button onClick={onConfirm} disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-amber-500/30">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldCheck className="w-4 h-4" />Pay &amp; Confirm Order</>}
              </button>
            </div>
          )}

          {/* Confirmed */}
          {status === 'CONFIRMED' && (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-2 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="font-bold text-emerald-300 text-lg">Order Confirmed!</p>
              <p className="text-sm text-slate-400 text-center">Your order has been placed on the ION network.</p>
              <button onClick={onClose} className="mt-1 text-sm text-slate-400 hover:text-white transition-colors underline underline-offset-4">
                Continue Shopping
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────── CheckoutFlow ──────────────────────────────── */
// Multi-step checkout inside the cart drawer:
//   SELECT_SENT → polling → QUOTE_RECEIVED → billing form → INIT_SENT → polling → INIT_RECEIVED → CONFIRM_SENT → CONFIRMED
function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110">
          <Star className={`w-6 h-6 ${n <= (hover || value) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
        </button>
      ))}
    </div>
  );
}

function CheckoutFlow({ cart, cartTotal, transaction, billing, setBilling, isLoading, onInit, onConfirm, onDone, onCancel, onRate, onSupport, onRequestStatus }) {
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [supportDesc, setSupportDesc] = useState('');
  const status = transaction?.status;

  // Parse BPP-confirmed quote from on_select
  const confirmedQuote = (status === 'QUOTE_RECEIVED' && transaction?.contract)
    ? parseOnSelectContract(
        typeof transaction.contract === 'string'
          ? JSON.parse(transaction.contract)
          : transaction.contract
      )
    : null;

  const currency = confirmedQuote?.currency || 'INR';

  /* ── Stepper ───────────────────────────────────────────────────────── */
  const STEPS = ['Quote', 'Billing', 'Confirm', 'Done'];
  const stepIndex = {
    SELECT_SENT:    0,
    QUOTE_RECEIVED: 1,
    INIT_SENT:      1,
    INIT_RECEIVED:  2,
    CONFIRM_SENT:   2,
    CONFIRMED:      3,
    STATUS_SENT:    3,
    CANCEL_SENT:    3,
    CANCELLED:      3,
    RATE_SENT:      3,
    SUPPORT_SENT:   3,
  }[status] ?? 0;

  return (
    <div className="flex flex-col flex-grow overflow-hidden">

      {/* Stepper */}
      <div className="px-5 pt-4 pb-3 shrink-0">
        <div className="relative flex items-center justify-between">
          <div className="absolute inset-x-0 top-3 h-px bg-white/10" />
          <div className="absolute left-0 top-3 h-px bg-emerald-400 transition-all duration-700"
            style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }} />
          {STEPS.map((label, i) => (
            <div key={i} className="relative flex flex-col items-center gap-1.5 z-10">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500 ${
                i < stepIndex ? 'bg-emerald-400 text-slate-900' :
                i === stepIndex ? 'bg-emerald-400 text-slate-900 ring-4 ring-emerald-400/20' :
                'bg-slate-700 text-slate-400'}`}>
                {i < stepIndex ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${i <= stepIndex ? 'text-emerald-400' : 'text-slate-500'}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-grow overflow-y-auto px-5 py-3 space-y-4">

        {/* Cart items summary (always shown, compact) */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.07] flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Summary</span>
            <span className="text-xs text-slate-400">{cart.reduce((s, i) => s + i.qty, 0)} items</span>
          </div>
          <div className="px-4 py-2 space-y-1.5">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 py-1">
                <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-slate-800">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover"
                    onError={e => { e.target.src = FALLBACK_IMG; }} />
                </div>
                <span className="flex-grow text-xs text-slate-300 truncate">{item.name}</span>
                <span className="text-xs font-semibold text-slate-200 shrink-0">×{item.qty}</span>
                <span className="text-xs font-bold shrink-0">{fmt(item.price * item.qty, item.currency)}</span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2 flex justify-between items-center">
              <span className="text-xs text-slate-400">Estimated Total</span>
              <span className="text-base font-bold text-emerald-300">{fmt(cartTotal, 'INR')}</span>
            </div>
          </div>
        </div>

        {/* ── Step: Waiting for on_select ─────────────────────────────── */}
        {status === 'SELECT_SENT' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
              <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm text-slate-300">Getting quote from network…</p>
            <p className="text-xs text-slate-500">Txn {transaction.id.slice(0, 8)}…</p>
          </div>
        )}

        {/* ── Step: Quote received → show BPP quote + billing form ────── */}
        {status === 'QUOTE_RECEIVED' && (
          <div className="space-y-4">
            {/* BPP confirmed quote */}
            {confirmedQuote && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/15 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Quote Confirmed by Seller</span>
                  {confirmedQuote.seller && (
                    <span className="ml-auto text-[10px] text-slate-400 flex items-center gap-1">
                      <Store className="w-3 h-3" />{confirmedQuote.seller}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {confirmedQuote.breakup.map((b, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-400">{b.title}</span>
                      <span className={b.type === 'DISCOUNT' ? 'text-emerald-400' : b.type === 'TAX' ? 'text-amber-400' : 'text-slate-200'}>
                        {fmt(b.amount, currency)}
                      </span>
                    </div>
                  ))}
                  {confirmedQuote.total && (
                    <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                      <span className="text-slate-200">Total</span>
                      <span className="text-emerald-300 text-lg">{fmt(confirmedQuote.total, currency)}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {confirmedQuote.codAvailable && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Banknote className="w-2.5 h-2.5" /> COD Available
                      </span>
                    )}
                    {confirmedQuote.returnPolicy?.allowed && (
                      <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">
                        ↩ {confirmedQuote.returnPolicy.window} returns
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Billing form */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.07] flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex-1">Billing Details</span>
                <button
                  type="button"
                  onClick={() => {
                    const profile = BILLING_PROFILES[_billingIdx % BILLING_PROFILES.length];
                    _billingIdx++;
                    setBilling(profile);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors"
                >
                  <Wand2 className="w-3 h-3" /> Auto-fill
                </button>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text" placeholder="Full name"
                    value={billing.name}
                    onChange={e => setBilling(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="tel" placeholder="Phone number"
                    value={billing.phone}
                    onChange={e => setBilling(p => ({ ...p, phone: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="email" placeholder="Email address"
                    value={billing.email}
                    onChange={e => setBilling(p => ({ ...p, email: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                </div>
                <div className="relative">
                  <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text" placeholder="Street address"
                    value={billing.streetAddress}
                    onChange={e => setBilling(p => ({ ...p, streetAddress: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text" placeholder="City"
                    value={billing.addressLocality}
                    onChange={e => setBilling(p => ({ ...p, addressLocality: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                  <input
                    type="text" placeholder="State"
                    value={billing.addressRegion}
                    onChange={e => setBilling(p => ({ ...p, addressRegion: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text" placeholder="Pincode"
                    value={billing.postalCode}
                    onChange={e => setBilling(p => ({ ...p, postalCode: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                  <input
                    type="text" placeholder="Country (e.g. IN)"
                    value={billing.addressCountry}
                    onChange={e => setBilling(p => ({ ...p, addressCountry: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Step: Waiting for on_init ──────────────────────────────── */}
        {status === 'INIT_SENT' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
              <ShieldCheck className="absolute inset-0 m-auto w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm text-slate-300">Initializing your order…</p>
          </div>
        )}

        {/* ── Step: Init received → ready to confirm ─────────────────── */}
        {status === 'INIT_RECEIVED' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <p className="text-sm font-medium text-blue-300">Order Initialized</p>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your order is ready. Review the details above and confirm to place your order on the ION network.
            </p>
            <div className="pt-1 text-xs text-slate-500 space-y-1">
              <p><span className="text-slate-400">Name:</span> {billing.name || 'Customer'}</p>
              <p><span className="text-slate-400">Phone:</span> {billing.phone || '—'}</p>
              {billing.email && <p><span className="text-slate-400">Email:</span> {billing.email}</p>}
              <p><span className="text-slate-400">Address:</span> {[billing.streetAddress, billing.addressLocality, billing.addressRegion, billing.postalCode].filter(Boolean).join(', ') || '—'}</p>
            </div>
          </motion.div>
        )}

        {/* ── Step: Waiting for on_confirm ──────────────────────────── */}
        {status === 'CONFIRM_SENT' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
              <Banknote className="absolute inset-0 m-auto w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm text-slate-300">Placing your order…</p>
          </div>
        )}

        {/* ── Step: Status requested ─────────────────────────────────── */}
        {status === 'STATUS_SENT' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 border-t-blue-400 animate-spin" />
              <RefreshCw className="absolute inset-0 m-auto w-5 h-5 text-blue-400" />
            </div>
            <p className="text-sm text-slate-300">Fetching latest order status…</p>
          </div>
        )}

        {/* ── Step: Confirmed — Order Detail card ─────────────────── */}
        {status === 'CONFIRMED' && (
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="space-y-4">
            {/* Success banner */}
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              </div>
              <p className="font-bold text-emerald-300 text-xl">Order Placed!</p>
              <p className="text-xs text-slate-400">Confirmed on the ION network</p>
            </div>

            {/* Order info */}
            <div className="text-xs text-slate-500 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 space-y-1">
              <p><span className="text-slate-400">Order ID:</span> <span className="font-mono text-slate-300 break-all">{transaction.id}</span></p>
              {billing.name && <p><span className="text-slate-400">Ordered by:</span> {billing.name}</p>}
              {billing.phone && <p><span className="text-slate-400">Phone:</span> {billing.phone}</p>}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={onRequestStatus}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20 transition-all">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
              </button>
              <button onClick={onCancel} disabled={isLoading}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50">
                <Ban className="w-3.5 h-3.5" /> Cancel Order
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={() => { setShowRatingForm(v => !v); setShowSupportForm(false); }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-all">
                <Star className="w-3.5 h-3.5" /> Rate Order
              </button>
              <button onClick={() => { setShowSupportForm(v => !v); setShowRatingForm(false); }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 transition-all">
                <MessageSquare className="w-3.5 h-3.5" /> Get Support
              </button>
            </div>

            {/* Inline rating form */}
            <AnimatePresence>
              {showRatingForm && !transaction.rated && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-3">
                  <p className="text-xs font-semibold text-amber-300">How was your experience?</p>
                  <StarRating value={ratingValue} onChange={setRatingValue} />
                  <textarea
                    value={ratingFeedback} onChange={e => setRatingFeedback(e.target.value)}
                    placeholder="Optional feedback…"
                    rows={2}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none resize-none"
                  />
                  <button
                    disabled={!ratingValue || isLoading}
                    onClick={() => { onRate(ratingValue, ratingFeedback); setShowRatingForm(false); }}
                    className="w-full py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><ThumbsUp className="w-3.5 h-3.5" /> Submit Rating</>}
                  </button>
                </motion.div>
              )}
              {transaction.rated && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Rated {transaction.rated}/5 — thank you!
                </div>
              )}
            </AnimatePresence>

            {/* Inline support form */}
            <AnimatePresence>
              {showSupportForm && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3 space-y-3">
                  <p className="text-xs font-semibold text-purple-300">Describe your issue</p>
                  <textarea
                    value={supportDesc} onChange={e => setSupportDesc(e.target.value)}
                    placeholder="What do you need help with?"
                    rows={3}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none resize-none"
                  />
                  <button
                    disabled={!supportDesc.trim() || isLoading}
                    onClick={() => { onSupport(supportDesc); setSupportDesc(''); setShowSupportForm(false); }}
                    className="w-full py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><MessageSquare className="w-3.5 h-3.5" /> Submit Request</>}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <button onClick={onDone}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30">
              <Sparkles className="w-4 h-4" /> Continue Shopping
            </button>
          </motion.div>
        )}

        {/* ── Step: Cancel sent / Cancelled ──────────────────────────── */}
        {(status === 'CANCEL_SENT' || status === 'CANCELLED') && (
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-500/15 border-2 border-rose-500/40 flex items-center justify-center">
              {status === 'CANCEL_SENT'
                ? <Loader2 className="w-9 h-9 text-rose-400 animate-spin" />
                : <Ban className="w-9 h-9 text-rose-400" />}
            </div>
            <p className="font-bold text-rose-300 text-lg">
              {status === 'CANCEL_SENT' ? 'Cancelling…' : 'Order Cancelled'}
            </p>
            <p className="text-xs text-slate-400">
              {status === 'CANCEL_SENT' ? 'Waiting for the seller to confirm cancellation.' : 'Your order has been cancelled.'}
            </p>
            {status === 'CANCELLED' && (
              <button onClick={onDone}
                className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                <Sparkles className="w-4 h-4" /> Back to Shopping
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Sticky action footer ────────────────────────────────────── */}
      {(status === 'QUOTE_RECEIVED' || status === 'INIT_RECEIVED') && (
        <div className="px-5 py-4 border-t border-white/[0.07] shrink-0">
          {status === 'QUOTE_RECEIVED' && (
            <button onClick={onInit} disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/30">
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Initializing…</>
                : <><ArrowRight className="w-4 h-4" /> Initialize Order</>}
            </button>
          )}
          {status === 'INIT_RECEIVED' && (
            <button onClick={onConfirm} disabled={isLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/30">
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>
                : <><ShieldCheck className="w-4 h-4" /> Pay &amp; Confirm Order</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Sample billing profiles ───────────────────────────── */

const BILLING_PROFILES = [
  {
    name: 'Arjun Sharma',
    email: 'arjun.sharma@example.in',
    phone: '+919876543210',
    streetAddress: '42 MG Road, Koramangala',
    addressLocality: 'Bengaluru',
    addressRegion: 'Karnataka',
    postalCode: '560034',
    addressCountry: 'IN',
  },
  {
    name: 'Priya Nair',
    email: 'priya.nair@example.in',
    phone: '+917012345678',
    streetAddress: '15 Marine Drive, Fort',
    addressLocality: 'Mumbai',
    addressRegion: 'Maharashtra',
    postalCode: '400001',
    addressCountry: 'IN',
  },
  {
    name: 'Reza Pratama',
    email: 'reza.pratama@example.id',
    phone: '+6281234567890',
    streetAddress: 'Jl. Sudirman No. 52, Senayan',
    addressLocality: 'Jakarta',
    addressRegion: 'DKI Jakarta',
    postalCode: '10270',
    addressCountry: 'ID',
  },
];
let _billingIdx = 0;

/* ─────────────────── Order History Drawer ──────────────────────────────── */

const STATUS_COLORS = {
  CONFIRMED:     { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  CANCELLED:     { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20'    },
  INIT_SENT:     { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20'    },
  CONFIRM_SENT:  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20'   },
  CANCEL_SENT:   { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20'    },
};

function fmtOrderDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

/* ── helpers to parse contract data ─────────────────────────────────────── */

function parseContractDetail(contract) {
  if (!contract || typeof contract !== 'object') return null;

  // Commitments → items
  const commitments = contract.commitments || [];
  const items = commitments.map(c => ({
    id:       c.id || '',
    name:     c.descriptor?.name || c.offer?.descriptor?.name || c.id || 'Item',
    qty:      c.quantity?.count ?? 1,
    offerId:  c.offer?.id || '',
    resourceId: c.offer?.resourceIds?.[0] || '',
  }));

  // Consideration → price
  const consideration = (contract.consideration || [])[0];
  const consAttr = consideration?.considerationAttributes || {};
  const price    = consAttr.totalAmount ?? null;
  const currency = consAttr.currency || 'INR';
  const breakup  = consAttr.breakup || [];

  // Participants
  const participants = contract.participants || [];
  const buyer  = participants.find(p => p.role?.code === 'BUYER'  || p.role === 'BUYER');
  const seller = participants.find(p => p.role?.code === 'SELLER' || p.role === 'SELLER');

  // Status
  const statusCode = contract.status?.code || '';

  return { items, price, currency, breakup, buyer, seller, statusCode, id: contract.id };
}

const ACTION_LABELS = {
  select:     { icon: '🔍', label: 'Item Selected',    color: 'text-cyan-400'    },
  on_select:  { icon: '💬', label: 'Quote Received',   color: 'text-blue-400'    },
  init:       { icon: '📋', label: 'Order Initialised', color: 'text-indigo-400' },
  on_init:    { icon: '✅', label: 'Order Confirmed',   color: 'text-emerald-400' },
  confirm:    { icon: '🛒', label: 'Confirm Sent',      color: 'text-amber-400'   },
  on_confirm: { icon: '🎉', label: 'Order Placed',      color: 'text-emerald-400' },
  cancel:     { icon: '🚫', label: 'Cancel Requested',  color: 'text-rose-400'    },
  on_cancel:  { icon: '❌', label: 'Order Cancelled',   color: 'text-rose-400'    },
  rate:       { icon: '⭐', label: 'Rated',             color: 'text-amber-400'   },
  on_rate:    { icon: '⭐', label: 'Rating Confirmed',  color: 'text-amber-400'   },
  on_status:  { icon: '📊', label: 'Status Update',     color: 'text-slate-400'   },
};

function OrderDetailPanel({ txnId, onBack }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`${API_BASE}/orders/${txnId}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || 'Failed')))
      .then(d => { setDetail(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [txnId]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 px-6">
      <Package className="w-10 h-10 opacity-20" />
      <p className="text-sm text-center">{error}</p>
    </div>
  );

  const sc = STATUS_COLORS[detail.status] || { bg: 'bg-slate-700/30', text: 'text-slate-400', border: 'border-slate-600/30' };

  // Best contract: latest snapshot with most data
  let bestContract = null;
  const snaps = (detail.snapshots || []);
  for (const s of [...snaps].reverse()) {
    const parsed = parseContractDetail(s.contract);
    if (parsed && (parsed.items.length > 0 || parsed.price !== null)) {
      bestContract = parsed;
      break;
    }
  }
  // Fallback to top-level contract
  if (!bestContract) bestContract = parseContractDetail(detail.contract);

  const fmt = (amount, cur) => {
    if (amount == null) return '—';
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur || 'INR', maximumFractionDigits: 0 }).format(amount); }
    catch { return `${cur || 'INR'} ${amount}`; }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

      {/* Status banner */}
      <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${sc.bg} ${sc.border}`}>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${sc.bg} border ${sc.border}`}>
          {detail.status === 'CONFIRMED' || detail.status === 'on_confirm'
            ? <CheckCircle2 className={`w-5 h-5 ${sc.text}`} />
            : detail.status.includes('CANCEL')
            ? <Ban className={`w-5 h-5 ${sc.text}`} />
            : <Package className={`w-5 h-5 ${sc.text}`} />
          }
        </div>
        <div>
          <p className={`text-sm font-bold ${sc.text}`}>{detail.status.replace(/_/g, ' ')}</p>
          <p className="text-[10px] text-slate-500">{fmtOrderDate(detail.updated_at)}</p>
        </div>
      </div>

      {/* IDs */}
      <div className="rounded-xl border border-white/[0.07] px-4 py-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Transaction</p>
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] text-slate-500 shrink-0">Txn ID</span>
          <span className="text-[11px] font-mono text-slate-300 break-all text-right">{detail.transaction_id}</span>
        </div>
        {bestContract?.id && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] text-slate-500 shrink-0">Contract ID</span>
            <span className="text-[11px] font-mono text-slate-300 break-all text-right">{bestContract.id}</span>
          </div>
        )}
      </div>

      {/* Items */}
      {bestContract?.items?.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <ShoppingCart className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Items Ordered</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {bestContract.items.map((item, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{item.name}</p>
                  {item.resourceId && <p className="text-[10px] font-mono text-slate-600 truncate">{item.resourceId}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">×{item.qty}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price / Breakup */}
      {bestContract?.price !== null && bestContract?.price !== undefined && (
        <div className="rounded-xl border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Payment</p>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            {bestContract.breakup.map((b, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-400">{b.title}</span>
                <span className={b.amount < 0 ? 'text-emerald-400' : 'text-slate-300'}>{fmt(b.amount, bestContract.currency)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-white/[0.06]">
              <span className="text-sm font-bold text-white">Total</span>
              <span className="text-sm font-bold text-emerald-300">{fmt(bestContract.price, bestContract.currency)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Buyer / Seller */}
      {(bestContract?.buyer || bestContract?.seller) && (
        <div className="rounded-xl border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Participants</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {[bestContract.buyer && { role: 'Buyer', p: bestContract.buyer }, bestContract.seller && { role: 'Seller', p: bestContract.seller }].filter(Boolean).map(({ role, p }) => (
              <div key={role} className="px-4 py-2.5">
                <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">{role}</p>
                <p className="text-sm text-white font-medium">{p.descriptor?.name || p.contact?.name || '—'}</p>
                {p.contact?.phone && <p className="text-xs text-slate-400">{p.contact.phone}</p>}
                {p.contact?.email && <p className="text-xs text-slate-400">{p.contact.email}</p>}
                {p.location?.address && <p className="text-xs text-slate-500 mt-0.5">{p.location.address}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {snaps.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Order Timeline</p>
          </div>
          <div className="px-4 py-3 space-y-3">
            {snaps.map((s, i) => {
              const al = ACTION_LABELS[s.action] || { icon: '•', label: s.action, color: 'text-slate-500' };
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-base bg-slate-800 border border-white/[0.07] ${al.color}`}>
                      {al.icon}
                    </div>
                    {i < snaps.length - 1 && <div className="w-px h-4 bg-white/[0.06] mt-1" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className={`text-xs font-semibold ${al.color}`}>{al.label}</p>
                    <p className="text-[10px] text-slate-600">{fmtOrderDate(s.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderHistoryDrawer({ open, onClose }) {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const limit = 10;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/orders?page=${p}&limit=${limit}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setOrders(d.items || []);
      setTotal(d.total || 0);
      setPage(p);
    } catch (e) {
      console.error('orders fetch', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { load(1); setSelectedId(null); }
  }, [open, load]);

  const totalPages = Math.ceil(total / limit);
  const statusStyle = (s) => STATUS_COLORS[s] || { bg: 'bg-slate-700/40', text: 'text-slate-400', border: 'border-slate-600/30' };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md glass z-50 flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
              <div className="flex items-center gap-2">
                {selectedId ? (
                  <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-white transition-colors mr-1">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                ) : null}
                <History className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-bold text-white">
                  {selectedId ? 'Order Detail' : 'Order History'}
                </h2>
                {!selectedId && total > 0 && (
                  <span className="bg-cyan-500/20 text-cyan-400 text-xs font-bold px-2 py-0.5 rounded-full">{total}</span>
                )}
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Detail panel */}
            <AnimatePresence mode="wait">
              {selectedId ? (
                <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  className="flex-1 flex flex-col overflow-hidden">
                  <OrderDetailPanel txnId={selectedId} onBack={() => setSelectedId(null)} />
                </motion.div>
              ) : (
                <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col overflow-hidden">

                  {/* Order list */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                    {loading && (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                      </div>
                    )}

                    {!loading && orders.length === 0 && (
                      <div className="flex flex-col items-center gap-3 py-20 text-slate-500">
                        <Package className="w-12 h-12 opacity-20" />
                        <p className="text-sm">No orders yet</p>
                        <p className="text-xs opacity-60">Your placed orders will appear here</p>
                      </div>
                    )}

                    {!loading && orders.map(order => {
                      const sc = statusStyle(order.status);
                      return (
                        <button key={order.transaction_id}
                          onClick={() => setSelectedId(order.transaction_id)}
                          className="w-full text-left rounded-xl border border-white/[0.07] px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] active:scale-[0.99] transition-all"
                          style={{ background: 'rgba(255,255,255,0.025)' }}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${sc.bg}`}>
                            <Package className={`w-4 h-4 ${sc.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white truncate">
                                {order.item_name || 'Order #' + order.transaction_id.slice(0, 8)}
                              </p>
                              <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                                {order.status.replace(/_/g,' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {order.item_price > 0 && (
                                <span className="text-xs font-semibold text-emerald-300">
                                  {order.currency} {order.item_price.toLocaleString()}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-600">
                                <Clock className="inline w-2.5 h-2.5 mr-0.5" />{fmtOrderDate(order.created_at)}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                        </button>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
                      <button onClick={() => load(page - 1)} disabled={page <= 1}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 border border-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        ← Prev
                      </button>
                      <span className="text-xs text-slate-500">Page {page} / {totalPages}</span>
                      <button onClick={() => load(page + 1)} disabled={page >= totalPages}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 border border-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        Next →
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────── App ────────────────────────────────────────── */
export default function App() {
  const [catalog, setCatalog]           = useState([]);
  const [isSearching, setIsSearching]   = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [cart, setCart]                 = useState([]);
  const [transaction, setTransaction]   = useState(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isCartOpen, setIsCartOpen]     = useState(false);
  const [cartCheckout, setCartCheckout] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [error, setError]               = useState(null);
  const [activeCategory, setActiveCategory]   = useState('All');
  const [sortBy, setSortBy]             = useState('default');
  const [billing, setBilling]           = useState({
    name: '', email: '', phone: '',
    streetAddress: '', addressLocality: '', addressRegion: '', postalCode: '', addressCountry: 'IN',
  });
  const debounceRef = useRef(null);

  /* ── Discover ─────────────────────────────────────────────────────────── */
  const discover = useCallback((q = '') => {
    setIsSearching(true);
    setError(null);
    const url = q.trim()
      ? `${API_BASE}/discover?q=${encodeURIComponent(q.trim())}`
      : `${API_BASE}/discover`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`Status ${r.status}`); return r.json(); })
      .then(d => { setCatalog(parseCatalogs(d)); setActiveCategory('All'); })
      .catch(e => { setError(e.message); setCatalog([]); })
      .finally(() => setIsSearching(false));
  }, []);

  useEffect(() => { discover(); }, [discover]);

  const handleSearchChange = e => {
    const v = e.target.value;
    setSearchQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => discover(v), 500);
  };

  /* ── Derived: categories + filtered + sorted catalog ─────────────────── */
  const categories = ['All', ...Array.from(new Set(catalog.map(p => p.category))).filter(Boolean)];

  const visibleCatalog = catalog
    .filter(p => activeCategory === 'All' || p.category === activeCategory)
    .sort((a, b) => {
      if (sortBy === 'price_asc')  return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'name')       return a.name.localeCompare(b.name);
      return 0;
    });

  /* ── Cart ─────────────────────────────────────────────────────────────── */
  const updateQty = (id, delta) =>
    setCart(p => p.map(i => i.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));

  const addToCart = p => setCart(prev => {
    const ex = prev.find(i => i.id === p.id);
    return ex ? prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...prev, { ...p, qty: 1 }];
  });

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  /* ── Transaction polling ─────────────────────────────────────────────── */
  useEffect(() => {
    const terminalStatuses = ['CONFIRMED', 'CANCELLED'];
    if (!transaction || terminalStatuses.includes(transaction.status)) return;
    const id = setInterval(() => {
      fetch(`${API_BASE}/status/${transaction.id}`)
        .then(r => r.json())
        .then(d => {
          setTransaction(p => {
            // Don't revert CANCEL_SENT back to CONFIRMED — the cancel is still
            // in-flight. Only advance to CANCELLED or later states.
            if (p.status === 'CANCEL_SENT' && d.status === 'CONFIRMED') return p;
            return { ...p, ...d };
          });
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [transaction]);

  /* ── Beckn: Select (single product from modal) ───────────────────────── */
  const handleSelectProduct = async (product) => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            resource_id:      product.id,
            offer_id:         product.offerId,
            offer_name:       product.offerName,
            quantity:         1,
            provider_id:      product.providerId,
            provider_name:    product.sellerName,
            offer_attributes: product.offerAttr || {},
            bpp_id:           product.bppId  || '',
            bpp_uri:          product.bppUri || '',
          }],
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setTransaction({ id: d.transaction_id, status: 'SELECT_SENT', product });
    } catch (e) { alert('Select failed: ' + e.message); }
    finally { setIsLoading(false); }
  };

  /* ── Beckn: Select (from cart) ───────────────────────────────────────── */
  const handleSelectCart = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            resource_id:      i.id,
            offer_id:         i.offerId      || '',
            offer_name:       i.offerName    || i.name,
            quantity:         i.qty,
            provider_id:      i.providerId   || '',
            provider_name:    i.sellerName   || '',
            offer_attributes: i.offerAttr    || {},
            bpp_id:           i.bppId        || '',
            bpp_uri:          i.bppUri       || '',
          })),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setTransaction({ id: d.transaction_id, status: 'SELECT_SENT' });
      setCartCheckout(true);
      setIsCartOpen(true);
    } catch (e) { alert('Select failed: ' + e.message); }
    finally { setIsLoading(false); }
  };

  /* ── Beckn: Init ─────────────────────────────────────────────────────── */
  const handleInit = async () => {
    if (!transaction) return;
    setIsLoading(true);
    try {
      await fetch(`${API_BASE}/init`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transaction.id,
          billing: {
            name:            billing.name            || 'Customer',
            email:           billing.email           || '',
            phone:           billing.phone           || '9999999999',
            streetAddress:   billing.streetAddress   || 'TBD',
            addressLocality: billing.addressLocality || 'TBD',
            addressRegion:   billing.addressRegion   || 'TBD',
            postalCode:      billing.postalCode      || '000000',
            addressCountry:  billing.addressCountry  || 'IN',
          },
        }),
      });
      setTransaction(p => ({ ...p, status: 'INIT_SENT' }));
    } catch (e) { alert('Init failed: ' + e.message); }
    finally { setIsLoading(false); }
  };

  /* ── Beckn: Confirm ──────────────────────────────────────────────────── */
  const handleConfirm = async () => {
    if (!transaction) return;
    setIsLoading(true);
    try {
      await fetch(`${API_BASE}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transaction.id }),
      });
      setTransaction(p => ({ ...p, status: 'CONFIRM_SENT' }));
    } catch (e) { alert('Confirm failed: ' + e.message); }
    finally { setIsLoading(false); }
  };

  /* ── Beckn: Request Status ───────────────────────────────────────────── */
  const handleRequestStatus = async () => {
    if (!transaction) return;
    try {
      await fetch(`${API_BASE}/request-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transaction.id }),
      });
      setTransaction(p => ({ ...p, status: 'STATUS_SENT' }));
    } catch (e) { alert('Status request failed: ' + e.message); }
  };

  /* ── Beckn: Cancel ───────────────────────────────────────────────────── */
  const handleCancel = async () => {
    if (!transaction) return;
    if (!window.confirm('Cancel this order?')) return;
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transaction.id }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || 'Cancel request failed');
      }
      setTransaction(p => ({ ...p, status: 'CANCEL_SENT' }));
    } catch (e) { alert('Cancel failed: ' + e.message); }
    finally { setIsLoading(false); }
  };

  /* ── Beckn: Rate ─────────────────────────────────────────────────────── */
  const handleRate = async (rating, feedback) => {
    if (!transaction) return;
    setIsLoading(true);
    try {
      const ratingInput = {
        id: transaction.id,
        ratingCategory: 'order',
        range: { min: 1, max: 5, value: rating },
      };
      if (feedback && feedback.trim()) {
        ratingInput.feedbackFormSubmission = { data: { comment: feedback.trim() } };
      }
      const r = await fetch(`${API_BASE}/rate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transaction.id,
          ratingInputs: [ratingInput],
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || 'Rating submission failed');
      }
      setTransaction(p => ({ ...p, rated: rating }));
    } catch (e) { alert('Rating failed: ' + e.message); }
    finally { setIsLoading(false); }
  };

  /* ── Beckn: Support ──────────────────────────────────────────────────── */
  const handleSupport = async (description) => {
    if (!transaction) return;
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/support`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transaction.id,
          orderId: transaction.id,
          description,
        }),
      });
      const d = await r.json();
      setTransaction(p => ({ ...p, supportTicketStatus: d.status || 'SUPPORT_SENT' }));
      alert('Support ticket created! The seller will get back to you.');
    } catch (e) { alert('Support request failed: ' + e.message); }
    finally { setIsLoading(false); }
  };

  /* ── Reset cart checkout back to browsing ─────────────────────────────── */
  const resetCart = () => {
    setCartCheckout(false);
    setTransaction(null);
    setCart([]);
    setBilling({ name: '', email: '', phone: '', streetAddress: '', addressLocality: '', addressRegion: '', postalCode: '', addressCountry: 'IN' });
    setIsCartOpen(false);
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen">

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <a href="https://remiges.tech" target="_blank" rel="noopener noreferrer" className="shrink-0">
            <img
              src="https://remiges.tech/wp-content/uploads/2024/04/Remiges-logo-2048x403.png"
              alt="Remiges"
              className="h-7 w-auto rounded"
              style={{ filter: 'brightness(0) invert(1)', opacity: 0.92 }}
            />
          </a>

          <form onSubmit={e => { e.preventDefault(); clearTimeout(debounceRef.current); discover(searchQuery); }} className="flex-1 max-w-2xl mx-auto">
            <div className="search-glow relative flex items-center bg-white/[0.06] border border-white/10 rounded-xl transition-all duration-300">
              {isSearching
                ? <Loader2 className="absolute left-3 w-4 h-4 text-emerald-400 animate-spin" />
                : <Search className="absolute left-3 w-4 h-4 text-slate-400" />
              }
              <input
                type="text" value={searchQuery} onChange={handleSearchChange}
                placeholder="Search products on the ION network…"
                className="w-full bg-transparent pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(''); discover(''); }}
                  className="absolute right-3 text-slate-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>

          <button
            onClick={() => setIsOrdersOpen(true)}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-sm font-medium text-slate-400 hover:text-white border border-white/[0.08] hover:border-white/[0.15]"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:block">Orders</span>
          </button>

          <button
            onClick={() => setIsCartOpen(true)}
            className="relative shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-medium text-white"
            style={{ background: 'rgba(0,184,230,0.15)', border: '1px solid rgba(0,184,230,0.3)' }}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:block">Cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Category chips + sort ─────────────────────────────────────────── */}
      {catalog.length > 0 && (
        <div className="sticky top-16 z-20 bg-[#080d1e]/90 backdrop-blur border-b border-white/[0.05]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            {/* Scrollable category chips */}
            <div className="flex gap-2 overflow-x-auto flex-1 scrollbar-none pb-0.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap
                    ${activeCategory === cat
                      ? 'text-white shadow-sm'
                      : 'bg-white/[0.06] text-slate-400 hover:text-slate-200 border border-white/[0.08]'
                    }`}
                  style={activeCategory === cat ? { background: 'linear-gradient(135deg,#00b8e6,#1e2fa0)', border: 'none' } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="shrink-0 bg-slate-900 border border-white/[0.08] text-slate-300 text-xs rounded-xl px-3 py-1.5 outline-none focus:border-white/20 cursor-pointer"
            >
              <option value="default">Relevance</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: '#00b8e6' }}>
              Remiges Retail · ION Network
            </p>
            <h1 className="text-3xl sm:text-4xl gradient-text">
              {searchQuery ? `Results for "${searchQuery}"` : activeCategory !== 'All' ? activeCategory : 'Discover Products'}
            </h1>
          </div>
          {visibleCatalog.length > 0 && (
            <span className="text-sm text-slate-500">{visibleCatalog.length} product{visibleCatalog.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* ── Catalog ──────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-36">

        {isSearching && catalog.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && !isSearching && (
          <div className="flex flex-col items-center justify-center py-28 gap-4 text-slate-400">
            <Package className="w-14 h-14 opacity-20" />
            <p className="font-medium">Could not reach the network.</p>
            <p className="text-sm opacity-60">Check your connection and try again.</p>
            <button onClick={() => discover(searchQuery)}
              className="mt-1 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#00b8e6,#1e2fa0)' }}>
              Retry
            </button>
          </div>
        )}

        {!isSearching && !error && visibleCatalog.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 gap-3 text-slate-400">
            <div className="w-20 h-20 rounded-full bg-white/[0.04] flex items-center justify-center mb-2">
              <Search className="w-9 h-9 opacity-30" />
            </div>
            <p className="font-semibold text-slate-300">No products found</p>
            <p className="text-sm opacity-60">{searchQuery ? `No results for "${searchQuery}"` : 'Try selecting a different category.'}</p>
            {activeCategory !== 'All' && (
              <button onClick={() => setActiveCategory('All')}
                className="mt-2 text-sm font-semibold px-4 py-1.5 rounded-full border border-white/10 text-slate-300 hover:border-white/20 transition-all">
                Clear filter
              </button>
            )}
          </div>
        )}

        {visibleCatalog.length > 0 && (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <AnimatePresence>
              {visibleCatalog.map((product, i) => {
                const inCart = cart.find(c => c.id === product.id);
                const cardKey = `${product.bppId}::${product.id}`;
                return (
                  <motion.div
                    key={cardKey} layout
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.22, delay: i * 0.025 }}
                    className="product-card glass rounded-2xl overflow-hidden flex flex-col cursor-pointer group"
                    onClick={() => setSelectedProduct(product)}
                  >
                    {/* Image */}
                    <div className="relative h-44 overflow-hidden bg-slate-800/60 shrink-0">
                      <img
                        src={product.image} alt={product.name}
                        className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                        onError={e => { e.target.src = FALLBACK_IMG; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
                      {/* Category badge */}
                      <span className="absolute top-2.5 left-2.5 bg-black/55 backdrop-blur-md text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-slate-300">
                        {product.category.length > 18 ? product.category.slice(0, 18) + '…' : product.category}
                      </span>
                      {/* COD badge */}
                      {product.codAvailable && (
                        <span className="absolute top-2.5 right-2.5 bg-amber-500/90 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-white">
                          COD
                        </span>
                      )}
                      {/* Offer validity */}
                      {product.offerValidity && (
                        <span className="absolute bottom-2.5 left-2.5 text-[10px] text-slate-300 bg-black/50 backdrop-blur px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" /> Till {product.offerValidity}
                        </span>
                      )}
                    </div>

                    {/* Body */}
                    <div className="p-3.5 flex flex-col flex-grow gap-1.5">
                      <h3 className="text-sm font-semibold leading-snug line-clamp-2">{product.name}</h3>
                      {product.shortDesc && (
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{product.shortDesc}</p>
                      )}

                      {/* Seller + delivery info */}
                      <div className="flex flex-col gap-1 mt-0.5">
                        {product.sellerName && (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                            <Store className="w-3 h-3 shrink-0" /> {product.sellerName}
                          </p>
                        )}
                        <div className="flex gap-1.5 flex-wrap">
                          {product.deliveryRange && (
                            <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" />{product.deliveryRange}
                            </span>
                          )}
                          {product.deliveryHours && (
                            <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />{product.deliveryHours}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price + cart controls */}
                      <div className="mt-auto pt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.05]">
                        <span className="text-base font-bold">{fmt(product.price, product.currency)}</span>

                        {inCart ? (
                          <div
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-0 rounded-xl overflow-hidden border"
                            style={{ borderColor: 'rgba(0,184,230,0.3)', background: 'rgba(0,184,230,0.1)' }}
                          >
                            <button onClick={() => updateQty(product.id, -1)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
                              style={{ color: '#00b8e6' }}>
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center text-sm font-bold" style={{ color: '#00b8e6' }}>{inCart.qty}</span>
                            <button onClick={() => updateQty(product.id, 1)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
                              style={{ color: '#00b8e6' }}>
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); addToCart(product); }}
                            className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow"
                            style={{ background: 'linear-gradient(135deg,#00b8e6,#1e2fa0)' }}
                          >
                            <Plus className="w-3.5 h-3.5" /> ADD
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* ── Sticky cart footer (Swiggy-style) ────────────────────────────── */}
      <AnimatePresence>
        {cart.length > 0 && !isCartOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-30 px-4 pb-4 sm:px-6"
          >
            <button
              onClick={() => { setIsCartOpen(true); setCartCheckout(false); }}
              className="w-full max-w-lg mx-auto flex items-center justify-between px-5 py-4 rounded-2xl text-white shadow-2xl transition-all active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg,#00b8e6 0%,#1e2fa0 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold">
                  {cartCount}
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium opacity-80">{cartCount} item{cartCount !== 1 ? 's' : ''} added</p>
                </div>
              </div>
              <div className="flex items-center gap-2 font-bold">
                <span>{fmt(cartTotal, 'INR')}</span>
                <div className="flex items-center gap-1 bg-white/15 px-3 py-1.5 rounded-xl text-sm">
                  View Cart <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Product Detail / Quote Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            transaction={transaction}
            onClose={() => setSelectedProduct(null)}
            onSelect={handleSelectProduct}
            onInit={handleInit}
            onConfirm={handleConfirm}
            isLoading={isLoading}
          />
        )}
      </AnimatePresence>

      {/* ── Order History Drawer ─────────────────────────────────────────── */}
      <OrderHistoryDrawer open={isOrdersOpen} onClose={() => setIsOrdersOpen(false)} />

      {/* ── Cart Drawer ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => { if (!cartCheckout) setIsCartOpen(false); }} />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-sm glass z-50 flex flex-col shadow-2xl"
            >
              {/* ── Drawer header ─────────────────────────────────── */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
                <div className="flex items-center gap-2">
                  {cartCheckout && transaction?.status !== 'CONFIRMED' && (
                    <button onClick={() => { setCartCheckout(false); setTransaction(null); }}
                      className="text-slate-400 hover:text-white transition-colors mr-1">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  {cartCheckout
                    ? <><Receipt className="w-5 h-5 text-emerald-400" /><h2 className="text-lg">Checkout</h2></>
                    : <><ShoppingCart className="w-5 h-5 text-emerald-400" /><h2 className="text-lg">Your Cart</h2>
                        {cartCount > 0 && <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">{cartCount}</span>}</>
                  }
                </div>
                {!cartCheckout && (
                  <button onClick={() => setIsCartOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* ── CART MODE: item list ──────────────────────────── */}
              {!cartCheckout && (
                <>
                  <div className="flex-grow overflow-y-auto px-5 py-4 space-y-3">
                    {cart.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 py-16">
                        <ShoppingCart className="w-12 h-12 opacity-20" />
                        <p className="text-sm">Your cart is empty</p>
                        <p className="text-xs opacity-60">Click any product card to add items</p>
                      </div>
                    ) : cart.map(item => {
                      const shortAddr = item.sellerAddress
                        ? [item.sellerAddress.streetAddress, item.sellerAddress.addressLocality, item.sellerAddress.addressRegion].filter(Boolean).join(', ')
                        : '';
                      return (
                        <div key={item.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                          {/* Hero image */}
                          <div className="relative h-36 bg-slate-800/80 overflow-hidden">
                            <img src={item.image} alt={item.name}
                              className="w-full h-full object-cover opacity-90"
                              onError={e => { e.target.src = FALLBACK_IMG; }} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10" />
                            <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
                              <p className="font-bold text-white text-sm leading-snug">{item.name}</p>
                              {item.shortDesc && <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">{item.shortDesc}</p>}
                            </div>
                          </div>

                          <div className="p-3 space-y-2.5">
                            {/* Offer name + validity */}
                            {(item.offerName || item.offerValidity) && (
                              <div className="flex items-center gap-2 text-[11px]">
                                {item.offerName && (
                                  <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 px-2 py-0.5 rounded-full font-semibold">
                                    {item.offerName}
                                  </span>
                                )}
                                {item.offerValidity && (
                                  <span className="text-slate-500 flex items-center gap-1 ml-auto">
                                    <Calendar className="w-3 h-3" /> Valid till {item.offerValidity}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Price row */}
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-bold text-emerald-300">{fmt(item.price, item.currency)}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateQty(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/10 transition-colors"><Minus className="w-3 h-3" /></button>
                                <span className="w-7 text-center text-sm font-bold">{item.qty}</span>
                                <button onClick={() => updateQty(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/10 transition-colors"><Plus className="w-3 h-3" /></button>
                              </div>
                            </div>

                            {/* Seller */}
                            {item.sellerName && (
                              <div className="flex items-start gap-2 text-[11px] text-slate-400">
                                <Store className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
                                <span>
                                  <span className="font-medium text-slate-300">{item.sellerName}</span>
                                  {shortAddr && <span className="text-slate-500 ml-1">· {shortAddr}</span>}
                                </span>
                              </div>
                            )}

                            {/* Delivery badges */}
                            {(item.deliveryRange || item.deliveryHours || item.codAvailable || item.returnPolicy?.allowed || item.cancelPolicy?.allowed) && (
                              <div className="flex flex-wrap gap-1.5">
                                {item.deliveryRange && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                    <MapPin className="w-2.5 h-2.5" /> Delivers within {item.deliveryRange}
                                  </span>
                                )}
                                {item.deliveryHours && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10 px-2 py-0.5 rounded-full">
                                    <Clock className="w-2.5 h-2.5" /> {item.deliveryHours}
                                  </span>
                                )}
                                {item.codAvailable && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                    <CreditCard className="w-2.5 h-2.5" /> Cash on Delivery
                                  </span>
                                )}
                                {item.returnPolicy?.allowed && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">
                                    <RotateCcw className="w-2.5 h-2.5" /> {item.returnPolicy.window?.replace('P','').replace('D',' day')} returns
                                  </span>
                                )}
                                {item.cancelPolicy?.allowed && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full">
                                    <X className="w-2.5 h-2.5" /> Free cancellation
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {cart.length > 0 && (
                    <div className="px-5 py-4 border-t border-white/[0.07] space-y-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-sm">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
                        <span className="text-xl font-bold">{fmt(cartTotal, 'INR')}</span>
                      </div>
                      <button onClick={handleSelectCart} disabled={isLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/30">
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Proceed to Checkout</span><ChevronRight className="w-4 h-4" /></>}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── CHECKOUT MODE ─────────────────────────────────── */}
              {cartCheckout && (
                <CheckoutFlow
                  cart={cart} cartTotal={cartTotal}
                  transaction={transaction}
                  billing={billing} setBilling={setBilling}
                  isLoading={isLoading}
                  onInit={handleInit}
                  onConfirm={handleConfirm}
                  onDone={resetCart}
                  onCancel={handleCancel}
                  onRate={handleRate}
                  onSupport={handleSupport}
                  onRequestStatus={handleRequestStatus}
                />
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
