import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircleHeart, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const AuthPage = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: 'Check your email', description: 'We sent you a verification link.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/chat');
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6 z-10"
      >
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-primary glow-primary">
            <MessageCircleHeart className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">
            Partner<span className="gradient-text">AI</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'signin' ? 'Welcome back 💕' : 'Create your account'}
          </p>
        </div>

        {/* Google */}
        <Button
          onClick={handleGoogle}
          disabled={loading}
          variant="outline"
          className="w-full h-11 gap-2 rounded-xl border-border/50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </Button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-secondary/40 border border-border/30 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-secondary/40 border border-border/30 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
              required
              minLength={6}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl gradient-primary border-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-primary font-medium">
            {mode === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default AuthPage;
