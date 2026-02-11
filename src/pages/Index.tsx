import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { motion } from 'framer-motion';
import {
  MessageCircleHeart, Heart, Sparkles, Shield, ArrowRight, Settings,
  Clock, Brain, Zap, Lock, ChevronDown, Mail, Check, Star, Loader2, Crown, Ticket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

const Index = () => {
  const { user, loading } = useAuth();
  const { plan, refreshUsage } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<{ valid: boolean; discount_type?: string; discount_value?: number; plan_duration?: string; promo_id?: string; error?: string } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const aboutRef = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);
  const faqRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const priceDisplay = currency === 'INR' ? { symbol: '₹', amount: '499', paise: 49900 } : { symbol: '$', amount: '9', paise: 900 };

  const handleUpgrade = async () => {
    if (!user) { navigate('/auth'); return; }
    setPaymentLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan: 'pro', currency }),
      });
      const order = await res.json();
      if (order.error) throw new Error(order.error);

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'PartnerAI',
        description: 'Pro Plan - Monthly',
        order_id: order.order_id,
        handler: async (response: any) => {
          const verifyRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const result = await verifyRes.json();
          if (result.success) {
            toast({ title: '🎉 Welcome to Pro!', description: 'Unlimited messages unlocked!' });
            refreshUsage();
          } else {
            toast({ title: 'Verification failed', description: result.error, variant: 'destructive' });
          }
        },
        prefill: { email: user.email },
        theme: { color: '#7c3aed' },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      toast({ title: 'Payment error', description: e.message, variant: 'destructive' });
    }
    setPaymentLoading(false);
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    if (!user) { navigate('/auth'); return; }
    setPromoLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api?action=validate-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: promoCode }),
      });
      const result = await res.json();
      setPromoResult(result);
      if (result.valid) {
        toast({ title: '🎉 Promo applied!', description: `${result.discount_type === 'percentage' ? `${result.discount_value}% off` : `₹${result.discount_value} off`} — Pro for ${result.plan_duration}` });
      } else {
        toast({ title: 'Invalid code', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not validate promo', variant: 'destructive' });
    }
    setPromoLoading(false);
  };

  const isFreePromo = promoResult?.valid && (
    (promoResult.discount_type === 'percentage' && (promoResult.discount_value ?? 0) >= 100) ||
    (promoResult.discount_type === 'fixed' && (promoResult.discount_value ?? 0) >= 499)
  );

  const handleRedeemPromo = async () => {
    if (!promoResult?.valid || !promoResult.promo_id || !user) return;
    setPaymentLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      if (isFreePromo) {
        // 100% discount — redeem directly
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api?action=redeem-promo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ promoId: promoResult.promo_id }),
        });
        const result = await res.json();
        if (result.success) {
          toast({ title: '🎉 Welcome to Pro!', description: `Unlocked for ${result.plan_duration}!` });
          refreshUsage();
          setPromoCode('');
          setPromoResult(null);
        } else {
          toast({ title: 'Error', description: result.error, variant: 'destructive' });
        }
      } else {
        // Partial discount — go through Razorpay with discounted price
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ plan: 'pro', currency, promoId: promoResult.promo_id }),
        });
        const order = await res.json();
        if (order.error) throw new Error(order.error);

        const options = {
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'PartnerAI',
          description: `Pro Plan — ${promoResult.discount_type === 'percentage' ? `${promoResult.discount_value}% off` : `₹${promoResult.discount_value} off`}`,
          order_id: order.order_id,
          handler: async (response: any) => {
            const verifyRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const result = await verifyRes.json();
            if (result.success) {
              toast({ title: '🎉 Welcome to Pro!', description: 'Unlimited messages unlocked!' });
              refreshUsage();
              setPromoCode('');
              setPromoResult(null);
            } else {
              toast({ title: 'Verification failed', description: result.error, variant: 'destructive' });
            }
          },
          prefill: { email: user.email },
          theme: { color: '#7c3aed' },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setPaymentLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl gradient-primary animate-pulse flex items-center justify-center">
          <MessageCircleHeart className="w-5 h-5 text-primary-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <MessageCircleHeart className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Partner<span className="gradient-text">AI</span></span>
          </button>
          <div className="hidden sm:flex items-center gap-6 text-xs text-muted-foreground">
            <button onClick={() => scrollTo(aboutRef)} className="hover:text-foreground transition-colors">About</button>
            <button onClick={() => scrollTo(pricingRef)} className="hover:text-foreground transition-colors">Pricing</button>
            <button onClick={() => scrollTo(faqRef)} className="hover:text-foreground transition-colors">FAQ</button>
            <button onClick={() => scrollTo(contactRef)} className="hover:text-foreground transition-colors">Contact</button>
          </div>
          <div className="flex items-center gap-2">
            {/* Currency Toggle */}
            <div className="flex items-center bg-secondary/40 rounded-full p-0.5 border border-border/30">
              <button
                onClick={() => setCurrency('INR')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${currency === 'INR' ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                ₹ INR
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${currency === 'USD' ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                $ USD
              </button>
            </div>
            {user ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="h-8 text-xs">
                  <Settings className="w-3.5 h-3.5 mr-1" /> Settings
                </Button>
                <Button size="sm" onClick={() => navigate('/chat')} className="h-8 text-xs gradient-primary border-0">
                  Open Chat <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => navigate('/auth')} className="h-8 text-xs gradient-primary border-0">
                Get Started
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[120px] pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative z-10 space-y-6">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl gradient-primary glow-primary">
            <MessageCircleHeart className="w-10 h-10 text-primary-foreground" />
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
            Talk to Your Partner's <br />
            <span className="gradient-text">AI Twin</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Upload your WhatsApp chat and our AI learns their exact texting style — pet names, emojis, language quirks, and all. Then chat with their digital twin anytime 💕
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => user ? navigate('/chat') : navigate('/auth')}
              className="h-12 px-8 rounded-xl gradient-primary border-0 text-base gap-2 shadow-lg shadow-primary/20">
              {user ? 'Open Chat' : 'Start Free'} <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => scrollTo(aboutRef)}
              className="h-12 px-8 rounded-xl text-base gap-2 border-border/40">
              Learn More <ChevronDown className="w-4 h-4" />
            </Button>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="text-xs text-muted-foreground/50">
            No credit card required • Works with any WhatsApp export
          </motion.p>
        </div>
      </section>

      {/* ─── Social Proof ─── */}
      <section className="py-10 border-y border-border/10">
        <div className="max-w-4xl mx-auto px-4 flex flex-wrap items-center justify-center gap-8 text-center">
          {[
            { value: '10K+', label: 'Chats Analyzed' },
            { value: '98%', label: 'Style Accuracy' },
            { value: '4.9', label: 'User Rating', icon: Star },
            { value: '<1s', label: 'Reply Speed' },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label} className="space-y-1">
              <p className="text-2xl font-bold gradient-text flex items-center justify-center gap-1">
                {value} {Icon && <Icon className="w-4 h-4 text-primary fill-primary" />}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── About / Features ─── */}
      <section ref={aboutRef} className="py-20 px-4">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold">How It <span className="gradient-text">Works</span></h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm">Three simple steps to start chatting with your partner's AI twin.</p>
          </div>

          {/* Steps */}
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Upload Chat', desc: 'Export your WhatsApp chat as .txt and upload it. We analyze every message pattern.', icon: Zap },
              { step: '2', title: 'AI Learns Style', desc: 'Our AI studies pet names, emoji habits, language mixing, greeting styles, and texting quirks.', icon: Brain },
              { step: '3', title: 'Start Chatting', desc: 'Text naturally and get replies that sound exactly like your partner — anytime, anywhere.', icon: MessageCircleHeart },
            ].map(({ step, title, desc, icon: Icon }, i) => (
              <motion.div key={step} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="p-6 rounded-2xl bg-card/50 border border-border/30 space-y-4 text-center hover:border-primary/20 transition-colors">
                <div className="w-12 h-12 rounded-2xl gradient-primary mx-auto flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-primary font-bold uppercase tracking-wider">Step {step}</p>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Feature Grid */}
          <div className="grid sm:grid-cols-2 gap-4 pt-8">
            {[
              { icon: Clock, title: 'Time-Aware Responses', desc: 'AI adapts tone for morning warmth, evening coziness, and late-night intimacy.' },
              { icon: Heart, title: 'Emotion Detection', desc: 'Detects your mood from emojis and words, responds with matching empathy.' },
              { icon: Sparkles, title: 'Reply Suggestions', desc: 'Get 3 quick reply options that match YOUR texting style perfectly.' },
              { icon: Lock, title: 'End-to-End Private', desc: 'Your data is encrypted and stored securely. Only you can access your chats.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="p-5 rounded-2xl bg-card/30 border border-border/20 flex gap-4 hover:bg-card/50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section ref={pricingRef} id="pricing" className="py-20 px-4 bg-card/20">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold">Simple <span className="gradient-text">Pricing</span></h2>
            <p className="text-muted-foreground text-sm">Start free, upgrade when you need more.</p>
            {/* Currency toggle in pricing */}
            <div className="flex items-center justify-center gap-2 pt-2">
              <div className="flex items-center bg-secondary/40 rounded-full p-0.5 border border-border/30">
                <button
                  onClick={() => setCurrency('INR')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${currency === 'INR' ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  ₹ INR
                </button>
                <button
                  onClick={() => setCurrency('USD')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${currency === 'USD' ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  $ USD
                </button>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Free */}
            <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="p-6 rounded-2xl bg-card border border-border/30 space-y-5">
              <div>
                <p className="text-sm font-bold">Free</p>
                <p className="text-3xl font-bold mt-1">{priceDisplay.symbol}0</p>
                <p className="text-xs text-muted-foreground">Forever free</p>
              </div>
              <ul className="space-y-2">
                {['Upload 1 chat export', '10 AI messages/day', 'Time-aware replies', 'Emotion detection', 'Reply suggestions'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={() => user ? navigate('/chat') : navigate('/auth')}
                className="w-full h-10 rounded-xl border-border/40">
                {user ? 'Open Chat' : 'Get Started'}
              </Button>
            </motion.div>

            {/* Pro */}
            <motion.div custom={1} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="p-6 rounded-2xl bg-card border-2 border-primary/30 space-y-5 relative overflow-hidden">
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">POPULAR</div>
              <div>
                <p className="text-sm font-bold">Pro</p>
                <p className="text-3xl font-bold mt-1">{priceDisplay.symbol}{priceDisplay.amount}<span className="text-base font-normal text-muted-foreground">/mo</span></p>
                <p className="text-xs text-muted-foreground">Unlimited everything</p>
              </div>
              <ul className="space-y-2">
                {['Everything in Free', 'Unlimited AI messages', 'Priority response speed', 'Advanced emotion AI', 'Re-upload & refresh chat', 'Priority support'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" /> {f}
                  </li>
                ))}
              </ul>

              {/* Promo Code Input */}
              {plan !== 'pro' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={promoCode}
                      onChange={e => { setPromoCode(e.target.value); setPromoResult(null); }}
                      placeholder="Promo code"
                      className="flex-1 h-9 px-3 rounded-lg bg-secondary/40 border border-border/30 text-xs outline-none focus:border-primary/50 uppercase placeholder:normal-case"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs gap-1 shrink-0"
                      onClick={handleApplyPromo}
                      disabled={promoLoading || !promoCode.trim()}
                    >
                      {promoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ticket className="w-3 h-3" />}
                      Apply
                    </Button>
                  </div>
                  {promoResult?.valid && (
                    <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-lg px-3 py-2 border border-primary/20">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{promoResult.discount_type === 'percentage' ? `${promoResult.discount_value}% off` : `₹${promoResult.discount_value} off`} • Pro for {promoResult.plan_duration}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Redeem promo or pay */}
              {promoResult?.valid ? (
                <Button
                  className="w-full h-10 rounded-xl gradient-primary border-0 gap-2"
                  onClick={handleRedeemPromo}
                  disabled={paymentLoading}
                >
                  {paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isFreePromo ? <Ticket className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
                  {isFreePromo ? 'Redeem & Activate Pro' : 'Pay Discounted Price'}
                </Button>
              ) : (
                <Button
                  className="w-full h-10 rounded-xl gradient-primary border-0 gap-2"
                  onClick={handleUpgrade}
                  disabled={paymentLoading || plan === 'pro'}
                >
                  {plan === 'pro' ? (
                    <><Crown className="w-4 h-4" /> Current Plan</>
                  ) : paymentLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                  ) : (
                    'Upgrade to Pro'
                  )}
                </Button>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section ref={faqRef} className="py-20 px-4">
        <div className="max-w-2xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold">Frequently <span className="gradient-text">Asked</span></h2>
          </div>

          <div className="space-y-3">
            {[
              { q: 'Is my chat data safe?', a: 'Absolutely. Your data is encrypted and stored securely in your private account. We never share or sell your data. You can delete everything anytime from Settings.' },
              { q: 'How accurate is the AI mimicry?', a: 'Our AI analyzes message patterns, emoji usage, pet names, greeting styles, and language mixing. Most users say the replies are scarily accurate — 98% style match rate.' },
              { q: 'Which languages are supported?', a: 'PartnerAI works with any language including mixed-language chats (Hinglish, Spanglish, etc.). The AI learns whatever language patterns exist in your chat.' },
              { q: 'Can I re-upload a newer chat export?', a: 'Yes! Go to Settings → Delete All Data, then upload a fresh export. The AI will re-learn the updated patterns.' },
              { q: 'Does it work with group chats?', a: 'Currently we support 1-on-1 chats only. Group chat support is on our roadmap.' },
              { q: 'How do I export my WhatsApp chat?', a: 'Open the chat in WhatsApp → tap ⋮ (menu) → More → Export Chat → Without Media → Save as .txt file.' },
            ].map(({ q, a }, i) => (
              <motion.details key={i} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="group p-4 rounded-2xl bg-card/50 border border-border/30 cursor-pointer hover:border-primary/20 transition-colors">
                <summary className="flex items-center justify-between text-sm font-semibold list-none">
                  {q}
                  <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Contact ─── */}
      <section ref={contactRef} className="py-20 px-4 bg-card/20">
        <div className="max-w-lg mx-auto space-y-8 text-center">
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold">Get in <span className="gradient-text">Touch</span></h2>
            <p className="text-muted-foreground text-sm">Have questions or feedback? We'd love to hear from you.</p>
          </div>

          <div className="space-y-4">
            <a href="mailto:hello@partnerai.app"
              className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-card border border-border/30 hover:border-primary/30 transition-colors">
              <Mail className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">hello@partnerai.app</span>
            </a>

            <div className="p-4 rounded-2xl bg-card border border-border/30 space-y-3">
              <p className="text-sm font-medium">Quick feedback</p>
              <textarea
                placeholder="Tell us what you think..."
                className="w-full h-24 px-4 py-3 rounded-xl bg-secondary/40 border border-border/30 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/40 resize-none"
              />
              <Button className="w-full h-10 rounded-xl gradient-primary border-0 text-sm">
                Send Feedback
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-8 px-4 border-t border-border/10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md gradient-primary flex items-center justify-center">
              <MessageCircleHeart className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-xs font-bold">Partner<span className="gradient-text">AI</span></span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <button onClick={() => scrollTo(aboutRef)} className="hover:text-foreground transition-colors">About</button>
            <button onClick={() => scrollTo(pricingRef)} className="hover:text-foreground transition-colors">Pricing</button>
            <button onClick={() => scrollTo(faqRef)} className="hover:text-foreground transition-colors">FAQ</button>
            <button onClick={() => scrollTo(contactRef)} className="hover:text-foreground transition-colors">Contact</button>
          </div>
          <p className="text-[11px] text-muted-foreground/40">© 2026 PartnerAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
