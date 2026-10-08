import { useState, useEffect, useRef } from 'react';
import { X, Heart, Trash2, CornerDownRight, Send, MessageCircle } from 'lucide-react';
import { comments as commentsApi, errMsg } from '../api';
import { Avatar, Spinner, EmptyState } from './ui';
import { timeAgo, formatCount } from '../lib/util';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import { Link } from 'react-router-dom';
import type { Comment } from '../types';

function CommentNode({ c, depth = 0, onReply, onDelete, onLike }: {
  c: Comment; depth?: number;
  onReply: (c: Comment) => void; onDelete: (c: Comment) => void; onLike: (c: Comment) => void;
}) {
  return (
    <div className={depth > 0 ? 'ml-5 pl-3 border-l border-line' : ''}>
      <div className="flex gap-2.5 py-2.5 group">
        <Link to={`/u/${c.author.username}`}><Avatar user={c.author} size={34} /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link to={`/u/${c.author.username}`} className="font-semibold text-sm hover:underline">{c.author.displayName}</Link>
            <span className="text-xs text-txt-muted">{timeAgo(c.createdAt)}</span>
          </div>
          <p className="text-sm text-txt-primary whitespace-pre-wrap break-words mt-0.5">{c.text}</p>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-txt-muted">
            <button onClick={() => onLike(c)} className={`flex items-center gap-1 hover:text-accent-pink transition ${c.liked ? 'text-accent-pink' : ''}`}>
              <Heart size={13} className={c.liked ? 'fill-accent-pink' : ''} />
              {c.likeCount > 0 && formatCount(c.likeCount)}
            </button>
            <button onClick={() => onReply(c)} className="hover:text-txt-primary transition flex items-center gap-1">
              <CornerDownRight size={13} /> Reply
            </button>
            {c.isOwn && (
              <button onClick={() => onDelete(c)} className="hover:text-accent-pink transition opacity-0 group-hover:opacity-100 flex items-center gap-1">
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
      {c.replies?.map((r) => (
        <CommentNode key={r.id} c={r} depth={depth + 1} onReply={onReply} onDelete={onDelete} onLike={onLike} />
      ))}
    </div>
  );
}

export function CommentsPanel({ postId, onClose, onCountChange }: {
  postId: string; onClose: () => void; onCountChange?: (n: number) => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const [list, setList] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [count, setCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data = await commentsApi.list(postId);
      setList(data.comments);
      setCount(data.count);
    } catch (e) { show(errMsg(e), 'error'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [postId]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  const submit = async () => {
    if (!user) { show('Sign in to comment.', 'info'); return; }
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await commentsApi.add(postId, t, replyTo?.id);
      setText('');
      setReplyTo(null);
      await load();
      const next = count + 1;
      setCount(next); onCountChange?.(next);
    } catch (e) { show(errMsg(e), 'error'); } finally { setSending(false); }
  };

  const like = async (c: Comment) => {
    const mut = (arr: Comment[]): Comment[] => arr.map((x) =>
      x.id === c.id ? { ...x, liked: !x.liked, likeCount: x.likeCount + (x.liked ? -1 : 1) } : { ...x, replies: mut(x.replies || []) });
    setList(mut);
    try { c.liked ? await commentsApi.unlike(c.id) : await commentsApi.like(c.id); }
    catch (e) { show(errMsg(e), 'error'); load(); }
  };

  const del = async (c: Comment) => {
    try {
      await commentsApi.remove(c.id);
      await load();
      const next = Math.max(0, count - 1);
      setCount(next); onCountChange?.(next);
      show('Comment deleted', 'success');
    } catch (e) { show(errMsg(e), 'error'); }
  };

  const reply = (c: Comment) => { setReplyTo(c); inputRef.current?.focus(); };

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 w-full md:w-[460px] md:max-h-[85vh] h-[88vh] md:h-[80vh] mt-auto md:mt-0 card rounded-t-2xl md:rounded-2xl flex flex-col animate-slide-up overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <h3 className="font-semibold">{count > 0 ? `${count} comment${count === 1 ? '' : 's'}` : 'Comments'}</h3>
          <button onClick={onClose} className="icon-btn w-9 h-9 -mr-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={MessageCircle} title="No comments yet" subtitle="Be the first to share what you think." />
          ) : (
            <div className="divide-y divide-line/60">
              {list.map((c) => <CommentNode key={c.id} c={c} onReply={reply} onDelete={del} onLike={like} />)}
            </div>
          )}
        </div>

        <div className="border-t border-line p-3 shrink-0 bg-ink-850">
          {replyTo && (
            <div className="flex items-center justify-between text-xs text-txt-secondary mb-2 px-1">
              <span>Replying to <b className="text-txt-primary">@{replyTo.author.username}</b></span>
              <button onClick={() => setReplyTo(null)} className="hover:text-txt-primary"><X size={14} /></button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Avatar user={user} size={32} />
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={user ? 'Add a comment…' : 'Sign in to comment'}
              disabled={!user}
              className="input !rounded-full !py-2 flex-1"
            />
            <button onClick={submit} disabled={!text.trim() || sending} className="btn-brand w-10 h-10 !p-0 shrink-0">
              {sending ? <Spinner className="!border-white/40 !border-t-white" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
