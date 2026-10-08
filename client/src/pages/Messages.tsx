import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Mail, Send, ArrowLeft, BadgeCheck } from 'lucide-react';
import { messages as dmApi, errMsg } from '../api';
import { Avatar, Spinner, EmptyState } from '../components/ui';
import { timeAgo } from '../lib/util';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import type { Conversation, DMMessage, User } from '../types';

export function Messages() {
  const { user } = useAuth();
  const { show } = useToast();
  const location = useLocation();
  const initialTo = (location.state as any)?.to as string | undefined;

  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<string | null>(initialTo || null);
  const [thread, setThread] = useState<{ user: User; messages: DMMessage[] } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConvos = useCallback(() => {
    dmApi.conversations().then(setConvos).catch(() => setConvos([]));
  }, []);
  useEffect(() => { loadConvos(); }, [loadConvos]);

  // Load + poll the open thread
  const loadThread = useCallback(() => {
    if (!active) return;
    dmApi.thread(active).then(setThread).catch((e) => show(errMsg(e), 'error'));
  }, [active, show]);
  useEffect(() => { setThread(null); loadThread(); }, [active, loadThread]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { loadThread(); loadConvos(); }, 5000);
    return () => clearInterval(id);
  }, [active, loadThread, loadConvos]);

  // Autoscroll to newest
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread?.messages.length, active]);

  const send = async () => {
    const t = text.trim();
    if (!t || !active || sending) return;
    setSending(true);
    try {
      const msg = await dmApi.send(active, t);
      setThread((th) => th ? { ...th, messages: [...th.messages, msg] } : th);
      setText('');
      loadConvos();
    } catch (e) { show(errMsg(e), 'error'); } finally { setSending(false); }
  };

  const List = (
    <div className="h-full overflow-y-auto">
      {convos === null ? <Spinner /> : convos.length === 0 && !active ? (
        <EmptyState icon={Mail} title="No messages yet" subtitle="Start a conversation from someone's profile — tap Message." />
      ) : (
        <div>
          {/* show the brand-new conversation at top if not in list */}
          {active && thread && !convos.some((c) => c.user.username === active) && (
            <ConvoRow active c={{ user: thread.user, lastMessage: 'New conversation', lastFromMe: false, lastAt: new Date().toISOString(), unread: 0 }} onClick={() => {}} />
          )}
          {convos.map((c) => (
            <ConvoRow key={c.user.id} c={c} active={c.user.username === active} onClick={() => setActive(c.user.username)} />
          ))}
        </div>
      )}
    </div>
  );

  const Thread = active && (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line shrink-0">
        <button className="icon-btn w-9 h-9 md:hidden -ml-1" onClick={() => setActive(null)}><ArrowLeft size={20} /></button>
        {thread && (
          <Link to={`/u/${thread.user.username}`} className="flex items-center gap-3 min-w-0">
            <Avatar user={thread.user} size={38} />
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-1 truncate">{thread.user.displayName}{thread.user.verified && <BadgeCheck size={14} className="text-brand-300" />}</div>
              <div className="text-xs text-txt-muted truncate">@{thread.user.username}</div>
            </div>
          </Link>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {!thread ? <Spinner /> : thread.messages.length === 0 ? (
          <div className="text-center text-sm text-txt-muted py-10">No messages yet. Say hi 👋</div>
        ) : thread.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug break-words ${m.mine ? 'bg-brand text-white rounded-br-md' : 'bg-ink-800 text-txt-primary rounded-bl-md'}`}>
              {m.text}
              <div className={`text-[10px] mt-1 ${m.mine ? 'text-white/70' : 'text-txt-muted'}`}>{timeAgo(m.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-3 shrink-0 flex items-center gap-2">
        <input
          className="input !rounded-full flex-1"
          placeholder="Message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button onClick={send} disabled={!text.trim() || sending} className="btn-brand w-11 h-11 !p-0 shrink-0">
          {sending ? <Spinner className="!border-white/40 !border-t-white" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto md:px-4">
      <div className="md:grid md:grid-cols-[320px_1fr] md:gap-0 md:border md:border-line md:rounded-2xl md:mt-4 overflow-hidden" style={{ height: 'calc(100vh - 90px)' }}>
        {/* List pane */}
        <div className={`md:border-r md:border-line flex-col ${active ? 'hidden md:flex' : 'flex'} h-full`}>
          <div className="px-4 py-3 border-b border-line shrink-0"><h1 className="text-lg font-bold">Messages</h1></div>
          {List}
        </div>
        {/* Thread pane */}
        <div className={`${active ? 'flex' : 'hidden md:flex'} flex-col h-full`}>
          {active ? Thread : (
            <div className="hidden md:flex h-full items-center justify-center">
              <EmptyState icon={Mail} title="Your messages" subtitle="Select a conversation, or start one from a profile." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConvoRow({ c, active, onClick }: { c: Conversation; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-850 ${active ? 'bg-ink-850' : ''}`}>
      <Avatar user={c.user} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold truncate flex items-center gap-1">{c.user.displayName}{c.user.verified && <BadgeCheck size={13} className="text-brand-300" />}</span>
          <span className="text-xs text-txt-muted shrink-0">{timeAgo(c.lastAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${c.unread ? 'text-txt-primary font-medium' : 'text-txt-muted'}`}>{c.lastFromMe ? 'You: ' : ''}{c.lastMessage}</span>
          {c.unread > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center">{c.unread}</span>}
        </div>
      </div>
    </button>
  );
}
