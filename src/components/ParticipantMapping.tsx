import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, ArrowRight, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ParseResult } from '@/lib/chatParser';

interface ParticipantMappingProps {
  parseResult: ParseResult;
  onMapped: (meName: string, otherName: string) => void;
}

const ParticipantMapping = ({ parseResult, onMapped }: ParticipantMappingProps) => {
  const [me, setMe] = useState('');
  const other = parseResult.participants.find(p => p !== me) || '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6 relative z-10"
      >
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl gradient-primary glow-primary">
            <Users className="w-5 h-5 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold">Who's who?</h2>
          <p className="text-sm text-muted-foreground">
            Found <span className="text-primary font-semibold">{parseResult.messages.length.toLocaleString()}</span> messages 💌
          </p>
        </div>

        {/* Preview */}
        <div className="bg-card/60 border border-border/50 rounded-xl p-4 max-h-36 overflow-y-auto">
          <div className="space-y-1 font-mono text-[11px] text-muted-foreground/70">
            {parseResult.preview.slice(0, 10).map((line, i) => (
              <p key={i} className="truncate">{line}</p>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-center">Tap yourself 👇</p>
          <div className="grid gap-2">
            {parseResult.participants.map((name) => (
              <motion.button
                key={name}
                whileTap={{ scale: 0.98 }}
                onClick={() => setMe(name)}
                className={`p-4 rounded-xl border text-left text-sm font-medium transition-all duration-200
                  ${me === name
                    ? 'border-primary bg-primary/10 glow-primary'
                    : 'border-border/50 bg-card/40 hover:border-primary/40'
                  }`}
              >
                <span>{name}</span>
                {me === name && <span className="ml-2 text-xs text-primary">← That's me!</span>}
              </motion.button>
            ))}
          </div>
        </div>

        {me && other && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-card/40 border border-border/40">
              <span className="text-sm font-medium">{me}</span>
              <Heart className="w-4 h-4 text-primary fill-primary" />
              <span className="text-sm font-medium">{other}</span>
            </div>
            <Button onClick={() => onMapped(me, other)} className="w-full gradient-primary text-primary-foreground border-0 h-12 text-sm font-semibold">
              Start Chatting <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default ParticipantMapping;
