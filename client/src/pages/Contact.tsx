import { Phone, Mail, Youtube, ExternalLink } from 'lucide-react';

// Owner contact details for OmniFeed.
const OWNER = {
  name: 'Kappy',
  blurb: 'Questions, feedback, or collabs? Reach the owner of OmniFeed directly.',
  phone: '818 694 1959',
  phoneHref: 'tel:+18186941959',
  email: 'kappyteen@gmail.com',
  youtube: 'https://www.youtube.com/@Kappy-d8u',
  youtubeLabel: '@Kappy-d8u',
};

function ContactCard({
  icon: Icon, label, value, href, external, accent,
}: {
  icon: any; label: string; value: string; href: string; external?: boolean; accent: string;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="card bg-ink-850 hover:bg-ink-800 p-4 flex items-center gap-4 transition group"
    >
      <div className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white ${accent}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-txt-muted">{label}</div>
        <div className="font-semibold truncate group-hover:text-brand-300 transition">{value}</div>
      </div>
      <ExternalLink size={18} className="text-txt-muted shrink-0 opacity-0 group-hover:opacity-100 transition" />
    </a>
  );
}

export function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Hero */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand via-accent-pink to-accent-amber grid place-items-center font-extrabold text-white text-2xl shadow-glow">
          O
        </div>
        <div>
          <h1 className="text-2xl font-bold">Contact the Owner</h1>
          <p className="text-txt-muted text-sm">OmniFeed · {OWNER.name}</p>
        </div>
      </div>

      <p className="text-txt-secondary mb-6">{OWNER.blurb}</p>

      <div className="space-y-3">
        <ContactCard
          icon={Phone} label="Call or text" value={OWNER.phone} href={OWNER.phoneHref}
          accent="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <ContactCard
          icon={Mail} label="Email" value={OWNER.email} href={`mailto:${OWNER.email}`}
          accent="bg-gradient-to-br from-brand to-accent-pink"
        />
        <ContactCard
          icon={Youtube} label="YouTube" value={OWNER.youtubeLabel} href={OWNER.youtube} external
          accent="bg-gradient-to-br from-red-500 to-rose-600"
        />
      </div>

      <p className="text-xs text-txt-muted text-center mt-8">
        Thanks for being part of OmniFeed. We usually reply within a day or two.
      </p>
    </div>
  );
}
