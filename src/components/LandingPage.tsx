import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, Heart, Shield, Trash2, Sparkles, MessageCircleHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { parseWhatsAppChat, type ParseResult } from '@/lib/chatParser';
import { deleteAllData } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';

interface LandingPageProps {
  onParsed: (result: ParseResult) => void;
}

const LandingPage = ({ onParsed }: LandingPageProps) => {
  const [consent, setConsent] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    if (!consent) {
      toast({ title: 'Consent required', description: 'Please check the consent box first.', variant: 'destructive' });
      return;
    }
    if (!file.name.endsWith('.txt')) {
      toast({ title: 'Invalid file', description: 'Upload a .txt WhatsApp export.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const text = await file.text();
      const result = parseWhatsAppChat(text);
      if (result.messages.length === 0) {
        toast({ title: 'No messages found', description: 'Could not parse messages from this file.', variant: 'destructive' });
        setLoading(false);
        return;
      }
      onParsed(result);
    } catch {
      toast({ title: 'Parse error', description: 'Failed to read the file.', variant: 'destructive' });
    }
    setLoading(false);
  }, [consent, onParsed, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const triggerUpload = () => {
    if (!consent) {
      toast({ title: 'Consent required', description: 'Check the consent box first.', variant: 'destructive' });
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) handleFile(f);
    };
    input.click();
  };

  const handleDeleteAll = async () => {
    await deleteAllData();
    toast({ title: 'All data deleted', description: 'Everything wiped clean. 💨' });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="w-full max-w-md space-y-8 relative z-10"
      >
        {/* Logo & Title */}
        <div className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary glow-primary"
          >
            <MessageCircleHeart className="w-8 h-8 text-primary-foreground" />
          </motion.div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              Partner<span className="gradient-text">AI</span>
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-xs mx-auto">
              Upload your chat history, and I'll learn your vibe. 
              Then let's chat — I'll help you craft the perfect replies. 💬✨
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Heart, label: 'Learns your style' },
            { icon: Sparkles, label: 'AI suggestions' },
            { icon: Shield, label: 'Private & local' },
          ].map(({ icon: Icon, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card/50 border border-border/50"
            >
              <Icon className="w-4 h-4 text-primary" />
              <span className="text-[11px] text-muted-foreground text-center">{label}</span>
            </motion.div>
          ))}
        </div>

        {/* Upload Area */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={triggerUpload}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300
              ${dragActive
                ? 'border-primary bg-primary/5 glow-primary scale-[1.02]'
                : 'border-border/60 hover:border-primary/40 hover:bg-card/30'
              }`}
          >
            <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${dragActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-sm font-medium">
              {loading ? (
                <span className="animate-pulse">Reading your memories...</span>
              ) : (
                'Drop your WhatsApp export here'
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              .txt file from WhatsApp "Export Chat"
            </p>
          </div>
        </motion.div>

        {/* Consent */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-card/40 border border-border/40">
          <Checkbox
            id="consent"
            checked={consent}
            onCheckedChange={(c) => setConsent(c === true)}
            className="mt-0.5 border-primary data-[state=checked]:bg-primary"
          />
          <label htmlFor="consent" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
            I own this chat export and have permission to use it. 
            All data stays on my device — nothing is stored on any server.
          </label>
        </div>

        {/* Delete */}
        <div className="flex justify-center pt-2">
          <button
            onClick={handleDeleteAll}
            className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Delete All Data
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default LandingPage;
